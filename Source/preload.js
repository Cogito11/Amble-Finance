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
