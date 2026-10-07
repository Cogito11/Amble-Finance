// window.storage: the one interface the rest of the app uses to persist anything.
//
//   get(key)                  -> { key, value, rev } | null (missing). THROWS if the read itself failed,
//                                so "couldn't read" can never be mistaken for "nothing saved".
//   set(key, value)           -> { key, value, rev } | null (failed). The simple form, for non-critical keys.
//   write(key, value, opts)   -> { ok: true, rev } | { ok: false, conflict: true, rev, value }
//                                | { ok: false, error: { code, message } }. The form the app's data uses:
//                                `opts.expectRev` makes it a compare-and-set (refused if another window
//                                changed the value since), and failures say why instead of returning null.
//   delete(key), list(prefix)
//   onChange(cb)              -> stop(). cb({ key, value, rev }) when ANOTHER window changed a value.
//
// Two backends sit behind it:
//   - In the Electron app, data-critical keys ("vault-finance-*": the data itself, set-aside records,
//     safety copies) are stored by the main process as real files, with atomic writes and automatic
//     backups (see store/fileStore.js). The renderer reaches it through the `ambleStore` bridge.
//   - Everything else stays in localStorage: UI preferences (theme, dashboard layout...) are read
//     synchronously at startup so the first paint is right, and they're not worth a file. localStorage is
//     also the whole backend when running as a plain web page (e.g. the Vite dev server in a browser).

// Which keys are "data" (file store) rather than preferences (localStorage). A test checks that every
// data key the app uses falls under this prefix.
export const DATA_KEY_PREFIX = "vault-finance-";
export const isDataKey = (key) => typeof key === "string" && key.startsWith(DATA_KEY_PREFIX);

// A cheap fingerprint of a string (FNV-1a + length), used as the "revision" in the localStorage backend.
// (The file store uses a SHA-1 of the content; either way a revision is an opaque token that changes
// when the content does.)
export function tokenOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${text.length}`;
}

// The revision of a key that doesn't exist yet.
export const NO_REVISION = "none";

const describeError = (e) => ({ code: (e && (e.code || e.name)) || "ERROR", message: (e && e.message) || String(e) });

/* ---------------------------------- localStorage backend ---------------------------------- */

export function createLocalAdapter(ls, eventTarget) {
  return {
    kind: "local",

    async get(key, shared) {
      const raw = ls.getItem(key); // may throw (storage disabled): deliberately not swallowed
      return raw === null ? null : { key, value: raw, shared: !!shared, rev: tokenOf(raw) };
    },

    async set(key, value, shared) {
      try {
        ls.setItem(key, value);
        return { key, value, shared: !!shared, rev: tokenOf(value) };
      } catch (e) {
        console.error("storage.set failed", e);
        return null;
      }
    },

    async write(key, value, opts = {}) {
      try {
        const current = ls.getItem(key);
        const currentRev = current === null ? NO_REVISION : tokenOf(current);
        if (opts.expectRev !== undefined && opts.expectRev !== currentRev) return { ok: false, conflict: true, rev: currentRev, value: current };
        if (current === value) return { ok: true, rev: currentRev, unchanged: true };
        ls.setItem(key, value);
        return { ok: true, rev: tokenOf(value) };
      } catch (e) {
        console.error("storage.write failed", e);
        return { ok: false, error: describeError(e) };
      }
    },

    async delete(key, shared) {
      try {
        ls.removeItem(key);
        return { key, deleted: true, shared: !!shared };
      } catch (e) {
        console.error("storage.delete failed", e);
        return null;
      }
    },

    async list(prefix = "", shared) {
      try {
        return { keys: Object.keys(ls).filter((k) => k.startsWith(prefix)), prefix, shared: !!shared };
      } catch (e) {
        console.error("storage.list failed", e);
        return null;
      }
    },

    // Browsers fire "storage" in every OTHER same-origin window when localStorage changes.
    onChange(callback) {
      if (!eventTarget) return () => {};
      const handler = (e) => callback({ key: e.key, value: e.newValue, rev: e.newValue == null ? NO_REVISION : tokenOf(e.newValue) });
      eventTarget.addEventListener("storage", handler);
      return () => eventTarget.removeEventListener("storage", handler);
    },
  };
}

/* ---------------------------------- file store backend (Electron) ---------------------------------- */

export function createFileAdapter(bridge) {
  const failed = (e) => ({ ok: false, error: describeError(e) });
  const call = async (fn) => { try { return await fn(); } catch (e) { return failed(e); } };

  return {
    kind: "file",

    async get(key, shared) {
      const r = await call(() => bridge.get(key));
      if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r.found ? { key, value: r.value, shared: !!shared, rev: r.rev } : null;
    },

    async set(key, value, shared) {
      const r = await call(() => bridge.write(key, value));
      if (r.ok) return { key, value, shared: !!shared, rev: r.rev };
      console.error("storage.set failed", r.error);
      return null;
    },

    write: (key, value, opts) => call(() => bridge.write(key, value, opts)),

    // Blocks until written. For use while the window is closing, when an async call might not finish.
    writeSync(key, value, opts) {
      try { return bridge.writeSync(key, value, opts); } catch (e) { return failed(e); }
    },

    async delete(key, shared) {
      const r = await call(() => bridge.delete(key));
      if (r.ok) return { key, deleted: true, shared: !!shared };
      console.error("storage.delete failed", r.error);
      return null;
    },

    async list(prefix = "", shared) {
      const r = await call(() => bridge.list(prefix));
      if (r.ok) return { keys: r.keys, prefix, shared: !!shared };
      console.error("storage.list failed", r.error);
      return null;
    },

    onChange: (callback) => bridge.onChange(callback),

    // Only the file store has these.
    listBackups: () => call(() => bridge.listBackups()),
    readBackup: (name) => call(() => bridge.readBackup(name)),
    getInfo: () => call(() => bridge.getInfo()),
    openDataFolder: () => call(() => bridge.openDataFolder()),
  };
}

/* ---------------------------------- the router ---------------------------------- */

export function createStorage({ bridge, local }) {
  const data = bridge ? createFileAdapter(bridge) : local;
  const pick = (key) => (isDataKey(key) ? data : local);
  const storage = {
    kind: data.kind,
    get: (key, shared) => pick(key).get(key, shared),
    set: (key, value, shared) => pick(key).set(key, value, shared),
    write: (key, value, opts) => pick(key).write(key, value, opts),
    delete: (key, shared) => pick(key).delete(key, shared),
    list: (prefix, shared) => (isDataKey(prefix) ? data : local).list(prefix, shared),
    // Changes to the data made by another window. (Preferences aren't synced between windows.)
    onChange: (callback) => data.onChange(callback),
  };
  if (data.kind === "file") {
    storage.writeSync = (key, value, opts) => data.writeSync(key, value, opts);
    storage.listBackups = data.listBackups;
    storage.readBackup = data.readBackup;
    storage.getInfo = data.getInfo;
    storage.openDataFolder = data.openDataFolder;
  }
  return storage;
}

function buildDefaultStorage() {
  if (typeof window === "undefined") return null;
  let ls;
  try { ls = window.localStorage; } catch (e) { ls = undefined; } // some embedded contexts forbid it
  const local = ls ? createLocalAdapter(ls, window) : createLocalAdapter({ getItem: () => null, setItem() { throw new Error("localStorage is unavailable"); }, removeItem() {}, }, window);
  return createStorage({ bridge: window.ambleStore, local });
}

const storage = buildDefaultStorage();
if (storage) window.storage = storage;

export default storage;
