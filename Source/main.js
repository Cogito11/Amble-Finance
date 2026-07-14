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
