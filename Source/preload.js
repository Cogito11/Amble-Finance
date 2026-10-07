const { contextBridge, ipcRenderer } = require("electron");

// A small, explicit bridge - only these three things are exposed to the
// renderer, nothing else from Node/Electron. Used to let the sidebar show a
// "popped out" indicator and to let a popout window ask to be closed and
// hand focus back to the main window.
contextBridge.exposeInMainWorld("electronAPI", {
  getPopoutState: () => ipcRenderer.invoke("popout:get-state"),

  onPopoutStateChange: (callback) => {
    const listener = (event, openViewIds) => callback(openViewIds);
    ipcRenderer.on("popout:state-changed", listener);
    return () => ipcRenderer.removeListener("popout:state-changed", listener);
  },

  returnToMain: () => ipcRenderer.send("popout:return-to-main"),
});

// The data store bridge (see store/fileStore.js and store/ipc.js). Everything here is a thin call
// into the main process, which owns the files; the renderer never touches the disk itself.
contextBridge.exposeInMainWorld("ambleStore", {
  get: (key) => ipcRenderer.invoke("store:get", key),
  write: (key, value, opts) => ipcRenderer.invoke("store:write", key, value, opts),
  // Blocks until written. Used only while a window is closing.
  writeSync: (key, value, opts) => ipcRenderer.sendSync("store:write-sync", key, value, opts),
  delete: (key) => ipcRenderer.invoke("store:delete", key),
  list: (prefix) => ipcRenderer.invoke("store:list", prefix),
  listBackups: () => ipcRenderer.invoke("store:list-backups"),
  readBackup: (name) => ipcRenderer.invoke("store:read-backup", name),
  getInfo: () => ipcRenderer.invoke("store:info"),
  openDataFolder: () => ipcRenderer.invoke("store:open-folder"),
  // Called when ANOTHER window changed a stored value. Returns a function that stops listening.
  onChange: (callback) => {
    const listener = (event, change) => callback(change);
    ipcRenderer.on("store:changed", listener);
    return () => ipcRenderer.removeListener("store:changed", listener);
  },
});
