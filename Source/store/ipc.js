// Connects the file store to the renderer windows over Electron IPC. Takes ipcMain / BrowserWindow /
// shell as parameters (instead of requiring Electron) so it can be tested with fakes.
//
// Every handler validates its arguments and returns a { ok, ... } object; none can throw across the
// IPC boundary. After a write that changed something, every OTHER window is told (never the one that
// made it) so edits in a popped-out window show up in the main window and vice versa.

const CHANGED_CHANNEL = "store:changed";

function unavailable(message) {
  return { ok: false, error: { code: "ESTOREUNAVAILABLE", message } };
}

// Only the two options the renderer is allowed to set; anything else is dropped.
function sanitizeOptions(opts) {
  const out = {};
  if (opts && typeof opts === "object") {
    if (typeof opts.expectRev === "string") out.expectRev = opts.expectRev;
    if (typeof opts.backupReason === "string") out.backupReason = opts.backupReason;
  }
  return out;
}

function registerStoreIpc({ ipcMain, BrowserWindow, shell, store, unavailableReason = "Amble's data folder couldn't be opened." }) {
  const guard = (fn) => (...args) => {
    if (!store) return unavailable(unavailableReason);
    try { return fn(...args); } catch (e) { return { ok: false, error: { code: (e && e.code) || "ERROR", message: (e && e.message) || String(e) } }; }
  };

  function notifyOthers(sender, payload) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed() || win.webContents === sender) return;
      win.webContents.send(CHANGED_CHANNEL, payload);
    });
  }

  const doWrite = guard((sender, key, value, opts) => {
    const result = store.write(key, value, sanitizeOptions(opts));
    if (result.ok && !result.unchanged) notifyOthers(sender, { key, value, rev: result.rev });
    return result;
  });

  ipcMain.handle("store:get", guard((e, key) => store.get(key)));
  ipcMain.handle("store:write", (e, key, value, opts) => doWrite(e.sender, key, value, opts));
  // Synchronous variant, used only while a window is closing so its last change can't be lost.
  ipcMain.on("store:write-sync", (e, key, value, opts) => { e.returnValue = doWrite(e.sender, key, value, opts); });
  ipcMain.handle("store:delete", guard((e, key) => {
    const result = store.delete(key);
    if (result.ok && result.removed) notifyOthers(e.sender, { key, value: null, rev: "none" });
    return result;
  }));
  ipcMain.handle("store:list", guard((e, prefix) => store.list(typeof prefix === "string" ? prefix : "")));
  ipcMain.handle("store:list-backups", guard(() => store.listBackups()));
  ipcMain.handle("store:read-backup", guard((e, name) => store.readBackup(name)));
  ipcMain.handle("store:info", guard(() => store.info()));
  ipcMain.handle("store:open-folder", async () => {
    if (!store) return unavailable(unavailableReason);
    const problem = await shell.openPath(store.info().dir); // "" on success, otherwise an error message
    return problem ? { ok: false, error: { code: "EOPEN", message: problem } } : { ok: true };
  });
}

module.exports = { registerStoreIpc, CHANGED_CHANNEL, sanitizeOptions };
