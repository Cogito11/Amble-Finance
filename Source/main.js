const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function getIconPath() {
  const base = path.join(__dirname, 'Amble/assets/logos');
  switch (process.platform) {
    case 'win32': return path.join(base, 'AmbleLogo.ico');
    case 'linux': return path.join(base, 'icons', '256x256.png');
    case 'darwin': return path.join(base, 'AmbleLogo.icns');
    default: return path.join(base, 'AmbleLogo.png');
  }
}

let mainWindow = null;

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

  // Track the first window as "main" so a relaunch attempt (blocked by the
  // single-instance lock) has something to focus. Pop-out windows created
  // later are not tracked here, so they don't interfere with this.
  if (!mainWindow) {
    mainWindow = win;
    win.on("closed", () => {
      mainWindow = null;
    });
  }

  return win;
}

// Ensure only one instance of the app can run, so a second launch
// can't spawn a second window in a separate process.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow();
    }
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
}
