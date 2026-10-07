// Deterministic pseudo-random numbers so a failing property test is reproducible.
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// `count` random whole-cent amounts in [0, maxCents].
export const randomCents = (rnd, count, maxCents) =>
  Array.from({ length: count }, () => Math.floor(rnd() * (maxCents + 1)));

// Splits `totalCents` into `parts` non-negative whole-cent pieces.
export function splitCents(rnd, totalCents, parts) {
  const out = [];
  let remaining = totalCents;
  for (let i = 0; i < parts - 1; i++) {
    const piece = Math.floor(rnd() * (remaining + 1));
    out.push(piece);
    remaining -= piece;
  }
  out.push(remaining);
  return out;
}

import { NO_REVISION, isDataKey, tokenOf } from "../Amble/storage";

// A shared "disk" that several fake windows (see fakeStorage) read and write, like the real file store.
//   deferEvents: when true, change notifications to other windows are queued instead of delivered, so a
//                test can reproduce "window B wrote before it heard about window A's change".
//                deliverAll() then delivers them.
export function createFakeDisk() {
  const disk = {
    data: new Map(),
    windows: new Set(),
    deferEvents: false,
    pending: [],
    backups: [],
    deliverAll() { const run = disk.pending.splice(0); run.forEach((fn) => fn()); },
  };
  return disk;
}

// An in-memory stand-in for window.storage, behaving like the real one (see Amble/storage.js):
// get -> null when missing; set -> null (not a throw) when it fails; write -> { ok, rev } / conflict / error.
//   quotaBytes:   writes that would push total size past this fail (simulates a full disk)
//   readThrows:   get() throws (simulates storage being unavailable)
//   disk:         share one disk between several fake storages to simulate several windows
//   kind:         "file" (default; has backups/getInfo) or "local"
// Extra test controls on the returned object: failWrites(n, error), writes (log of write calls), writeSyncCalls.
export function fakeStorage({ quotaBytes = Infinity, readThrows = false, disk = createFakeDisk(), kind = "file" } = {}) {
  const data = disk.data;
  const listeners = new Set();
  const size = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0);
  let failing = null;

  const storage = {
    kind,
    data,
    disk,
    writes: [],
    writeSyncCalls: 0,
    failWrites(count, error = { code: "ENOSPC", message: "no space left on device" }) { failing = { count, error }; },

    async get(key) {
      if (readThrows) throw new Error("storage unavailable");
      return data.has(key) ? { key, value: data.get(key), shared: false, rev: tokenOf(data.get(key)) } : null;
    },

    _write(key, value, opts = {}) {
      storage.writes.push({ key, value, opts });
      // Like the real router, only DATA keys go to the file store; preference writes (amble-*) live in
      // localStorage and aren't affected by a file-store failure.
      if (failing && failing.count > 0 && isDataKey(key)) { failing.count--; return { ok: false, error: failing.error }; }
      const current = data.has(key) ? data.get(key) : null;
      const currentRev = current === null ? NO_REVISION : tokenOf(current);
      if (opts.expectRev !== undefined && opts.expectRev !== currentRev) return { ok: false, conflict: true, rev: currentRev, value: current };
      if (current === value) return { ok: true, rev: currentRev, unchanged: true };
      const replaced = data.has(key) ? key.length + data.get(key).length : 0;
      if (size() - replaced + key.length + value.length > quotaBytes) return { ok: false, error: { code: "QuotaExceededError", message: "storage is full" } };
      if (current !== null && opts.backupReason) disk.backups.push({ name: `${disk.backups.length}-${opts.backupReason}.json`, reason: opts.backupReason, size: current.length, modifiedMs: 0, text: current });
      data.set(key, value);
      const change = { key, value, rev: tokenOf(value) };
      disk.windows.forEach((w) => {
        if (w === storage) return;
        const run = () => w._listeners.forEach((cb) => cb(change));
        if (disk.deferEvents) disk.pending.push(run); else run();
      });
      return { ok: true, rev: change.rev };
    },

    async write(key, value, opts) { return storage._write(key, value, opts); },
    writeSync(key, value, opts) { storage.writeSyncCalls++; return storage._write(key, value, opts); },
    async set(key, value) { const r = storage._write(key, value); return r.ok ? { key, value, shared: false, rev: r.rev } : null; },
    async delete(key) { data.delete(key); return { key, deleted: true, shared: false }; },
    async list(prefix = "") { return { keys: [...data.keys()].filter((k) => k.startsWith(prefix)), prefix, shared: false }; },
    _listeners: listeners,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };

  if (kind === "file") {
    storage.listBackups = async () => ({ ok: true, backups: disk.backups.map(({ name, reason, size: sz, modifiedMs }) => ({ name, reason, size: sz, modifiedMs })).reverse() });
    storage.readBackup = async (name) => { const b = disk.backups.find((x) => x.name === name); return b ? { ok: true, value: b.text } : { ok: false, error: { code: "ENOENT", message: "no such backup" } }; };
    storage.getInfo = async () => ({ ok: true, dir: "/fake/data", storeDir: "/fake/data/store", backupDir: "/fake/data/backups" });
    storage.openDataFolder = async () => ({ ok: true });
  }
  disk.windows.add(storage);
  return storage;
}

// localStorage-alike whose stored keys are its own enumerable properties (so Object.keys works, as in a browser).
export function legacyStorage(entries = {}, { failGets = false } = {}) {
  const ls = Object.create({
    getItem(k) { if (failGets) throw new Error("denied"); return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  });
  Object.assign(ls, entries);
  return ls;
}
