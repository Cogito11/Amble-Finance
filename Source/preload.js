const { contextBridge, ipcRenderer } = require("electron");

// Exposes the same get/set/delete/list shape the app already expects on
// window.storage, but backed by a real JSON file on disk (written by the main
// process - see main.js) instead of the renderer's localStorage. Each call
// round-trips through IPC to main, which writes synchronously before
// responding, so by the time a `set()` promise resolves here, the data is
// already durably on disk - no dependency on Chromium's internal storage
// flush timing.
contextBridge.exposeInMainWorld("storage", {
  get: (key, shared) => ipcRenderer.invoke("storage:get", key, !!shared),
  set: (key, value, shared) => ipcRenderer.invoke("storage:set", key, value, !!shared),
  delete: (key, shared) => ipcRenderer.invoke("storage:delete", key, !!shared),
  list: (prefix, shared) => ipcRenderer.invoke("storage:list", prefix || "", !!shared),
});
