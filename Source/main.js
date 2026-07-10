const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

function getIconPath() {
  const base = path.join(__dirname, 'Amble/assets/logos');
  switch (process.platform) {
    case 'win32': return path.join(base, 'AmbleLogo.ico');
    case 'linux': return path.join(base, 'icons', '256x256.png');
    case 'darwin': return path.join(base, 'AmbleLogo.png');
    default: return path.join(base, 'AmbleLogo.png');
  }
}

// electron-builder sets PORTABLE_EXECUTABLE_DIR when a Windows "portable"
// build is launched, pointing at the folder the exe itself was run from (a USB
// drive, a random Downloads folder, etc). An AppImage sets APPIMAGE the same
// way on Linux. Neither is set for a normal installed build or in dev, so
// those fall through to null and just use Electron's regular per-OS userData
// folder further down. macOS has no equivalent portable convention.
function resolvePortableRoot() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
  return null;
}

const portableRoot = resolvePortableRoot();
const isPortable = !!portableRoot;

// Must happen before app.whenReady() — this is what makes "portable" actually
// portable (data travels with the exe) instead of just a label while Amble
// quietly keeps writing to %APPDATA% like a normal install.
if (portableRoot) {
  app.setPath("userData", path.join(portableRoot, "Amble-data"));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,

    minWidth: 400,
    minHeight: 300,

    autoHideMenuBar: true,
    titleBarStyle: "hidden",

    title: "Amble Finance",
    icon: getIconPath(),
    backgroundColor: "#f4f9fd",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "dist/index.html"));
  }
}

// Backs the "Storage" section of Data settings — reports where Amble's data
// actually lives (and whether that's a portable, alongside-the-exe location or
// the OS's normal per-user app-data folder) and opens it on request.
ipcMain.handle("storage:get-info", () => {
  return { path: app.getPath("userData"), portable: isPortable };
});

ipcMain.handle("storage:open-folder", async () => {
  const dir = app.getPath("userData");
  // A fresh install may not have written anything to disk yet — make sure the
  // folder exists before asking the OS to show it, or the request silently fails.
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* best effort */ }
  const result = await shell.openPath(dir);
  if (result) console.error("Failed to open storage folder:", result);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
