// Provides the same window.storage.get/set/delete/list interface the app was
// originally built against, backed by the browser's localStorage instead of
// Claude's artifact storage. This means all your data lives only on this
// device/browser profile — nothing is sent anywhere.

const storage = {
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

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
