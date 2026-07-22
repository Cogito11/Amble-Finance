// window.storage is normally provided by preload.js via contextBridge, backed
// by a real JSON file on disk (see main.js) - that's what gives Amble durable,
// crash-safe persistence. This file only kicks in as a fallback for contexts
// where that bridge isn't present (e.g. opening dist/index.html directly in a
// plain browser instead of through Electron), using localStorage so the app
// still works, just without the same durability guarantees.
if (typeof window !== "undefined" && !window.storage) {
  const fallback = {
    async get(key, shared) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        return { key, value: raw, shared: !!shared };
      } catch (e) {
        console.error("storage.get failed", e);
        return null;
      }
    },

    async set(key, value, shared) {
      try {
        localStorage.setItem(key, value);
        return { key, value, shared: !!shared };
      } catch (e) {
        console.error("storage.set failed", e);
        return null;
      }
    },

    async delete(key, shared) {
      try {
        localStorage.removeItem(key);
        return { key, deleted: true, shared: !!shared };
      } catch (e) {
        console.error("storage.delete failed", e);
        return null;
      }
    },

    async list(prefix = "", shared) {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
        return { keys, prefix, shared: !!shared };
      } catch (e) {
        console.error("storage.list failed", e);
        return null;
      }
    },
  };

  console.warn("window.storage bridge not found (not running under Electron preload) - falling back to localStorage. Data will NOT be saved to amble-data.json.");
  window.storage = fallback;
}

export default (typeof window !== "undefined" ? window.storage : null);
