const { contextBridge, ipcRenderer } = require("electron");

// Exposes just where Amble's data lives (and how to reveal it in the OS file
// manager) to the renderer — kept separate from the actual read/write storage
// API (window.storage in storage.js) since this is purely informational and
// doesn't touch app data itself.
contextBridge.exposeInMainWorld("storageInfo", {
  get: () => ipcRenderer.invoke("storage:get-info"),
  openFolder: () => ipcRenderer.invoke("storage:open-folder"),
});
