const { app, BrowserWindow, shell, screen, ipcMain } = require("electron");
const path = require("path");

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

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

// Popped-out views (e.g. Transactions in its own window) are tracked here by
// the view id they were opened for, so clicking "pop out" again for a view
// that's already open focuses that window instead of spawning a duplicate.
const popoutWindows = new Map();

// Tells every open window (main + popouts) which view ids currently have a
// popout open, so the sidebar can show a "popped out" indicator on the right
// nav item. Called any time popoutWindows changes.
function broadcastPopoutState() {
  const openViewIds = Array.from(popoutWindows.keys());
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send("popout:state-changed", openViewIds);
  });
}

ipcMain.handle("popout:get-state", () => Array.from(popoutWindows.keys()));

// The "back to main window" button in a popout's header sends this instead
// of just calling window.close() itself, so we can also bring the main
// window forward - closing a window doesn't reliably refocus another one.
ipcMain.on("popout:return-to-main", (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

// Every window - main or popout - gets this same handler. It's what decides
// whether a window.open()/target="_blank" call is Amble opening one of its
// own views (create a real Electron window, sharing this session's
// localStorage) or a genuine external link like the About tab's GitHub/
// website links (hand off to the system browser instead).
function attachWindowOpenHandler(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try {
      target = new URL(url);
    } catch (e) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    const popoutId = target.searchParams.get("popout");
    const isOwnApp = devServerUrl ? url.startsWith(devServerUrl) : target.protocol === "file:";

    if (popoutId && isOwnApp) {
      // We create/focus the window ourselves (see below) rather than letting
      // Electron auto-create one via { action: "allow" }, since that path
      // can't de-duplicate an already-open popout for the same view.
      openPopoutWindow(popoutId, url);
      return { action: "deny" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });
}

function openPopoutWindow(popoutId, url) {
  const existing = popoutWindows.get(popoutId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  const workArea = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.round(workArea.width / 2),
    height: workArea.height,

    minWidth: 360,
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

  attachWindowOpenHandler(win);
  win.loadURL(url);
  if (devServerUrl) win.webContents.openDevTools({ mode: "detach" });

  popoutWindows.set(popoutId, win);
  broadcastPopoutState();
  win.on("closed", () => {
    if (popoutWindows.get(popoutId) === win) popoutWindows.delete(popoutId);
    broadcastPopoutState();
  });
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

  attachWindowOpenHandler(win);

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
    // The main window going away is the natural signal to close any popouts
    // with it - otherwise you'd be left with orphaned, chromeless windows
    // and no way to get the sidebar/nav back.
    win.on("close", () => {
      popoutWindows.forEach((w) => { if (!w.isDestroyed()) w.close(); });
    });
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
