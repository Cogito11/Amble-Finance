const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

/* ---------------------------------- persistent storage ---------------------------------- */
// Replaces the old localStorage-based persistence. Everything lives in one JSON
// file under Electron's userData dir (a stable, OS-defined path independent of
// where the app binary happens to run from - unlike a file:// origin, which can
// change between launches for some packaging types).
//
// Writes happen with writeFileSync directly on the main process, in response to
// an IPC call from the renderer (see preload.js). Because this is synchronous,
// by the time the renderer's `await window.storage.set(...)` call resolves, the
// bytes are already on disk - there's no background flush timer to race against,
// unlike the renderer's localStorage.
const DATA_FILE = path.join(app.getPath("userData"), "amble-data.json");

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    // File doesn't exist yet (first launch) or is unreadable/corrupt - either
    // way, start from an empty store rather than crashing the app.
    return {};
  }
}

let store = loadStore();

// Atomic write: write to a temp file in the same directory, then rename over
// the real file. Rename is atomic on POSIX filesystems, so a crash or power
// loss mid-write can never leave amble-data.json half-written/corrupted - the
// worst case is losing the write of a single failed operation, not the whole
// file.
function persist() {
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store), "utf-8");
  fs.renameSync(tmpFile, DATA_FILE);
}

ipcMain.handle("storage:get", (event, key) => {
  return Object.prototype.hasOwnProperty.call(store, key)
    ? { key, value: store[key], shared: false }
    : null;
});

ipcMain.handle("storage:set", (event, key, value) => {
  store[key] = value;
  persist();
  return { key, value, shared: false };
});

ipcMain.handle("storage:delete", (event, key) => {
  const existed = Object.prototype.hasOwnProperty.call(store, key);
  delete store[key];
  if (existed) persist();
  return { key, deleted: true, shared: false };
});

ipcMain.handle("storage:list", (event, prefix) => {
  const keys = Object.keys(store).filter((k) => k.startsWith(prefix || ""));
  return { keys, prefix: prefix || "", shared: false };
});

/* ---------------------------------- window ---------------------------------- */
function getIconPath() {
  const base = path.join(__dirname, 'Amble/assets/logos');
  switch (process.platform) {
    case 'win32': return path.join(base, 'AmbleLogo.ico');
    case 'linux': return path.join(base, 'icons', '256x256.png');
    case 'darwin': return path.join(base, 'AmbleLogo.icns');
    default: return path.join(base, 'AmbleLogo.png');
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,

    minWidth: 400,
    minHeight: 300,

    autoHideMenuBar: true,

    title: "Amble Finance",
    icon: getIconPath(),
    backgroundColor: "#f4f9fd",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
