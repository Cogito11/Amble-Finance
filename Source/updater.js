// In-place updates for the desktop app, built on electron-updater.
//
// How it works: every release on GitHub carries a small `latest*.yml` file (written by
// electron-builder when it publishes) that lists the new build and its checksum. This module checks
// that file, and when the person agrees, downloads only the new build (a differential download where
// the platform supports it), verifies it, and installs it on restart. No installer to fetch by hand.
//
// Like store/ipc.js, everything Electron-specific is passed in as a parameter so this file can be
// tested with fakes. It never throws across the IPC boundary: failures become `error` in the state.

const fs = require("fs");
const path = require("path");

const CHANNELS = {
  getState: "updater:get-state",
  check: "updater:check",
  download: "updater:download",
  install: "updater:install",
  changed: "updater:state-changed",
};

// Wait a little after launch so the check never competes with the window opening, then re-check
// while the app stays open (people leave Amble running for days).
const FIRST_CHECK_DELAY_MS = 15 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// macOS can only swap in a new version of an app that is code-signed with an Apple Developer ID
// (the release workflow doesn't sign yet). An unsigned update would download and then fail, so until
// the builds are signed and notarized, Mac stays on the "download from the website" path. Flip this
// to true once they are.
const MAC_IN_PLACE_UPDATES = false;

// Can this installation update itself? When it can't, the renderer falls back to the plain
// "check GitHub, then open the download page" flow, so nobody is left without a way to update.
function detectSupport({ isPackaged, platform, env, resourcesPath, existsSync = fs.existsSync }) {
  if (!isPackaged) return { supported: false, reason: "dev" };

  if (platform === "win32") {
    // The portable .exe has no installer to replace, so it can't update itself.
    if (env.PORTABLE_EXECUTABLE_FILE) return { supported: false, reason: "portable" };
    return { supported: true };
  }

  if (platform === "darwin") {
    return MAC_IN_PLACE_UPDATES ? { supported: true } : { supported: false, reason: "mac-unsigned" };
  }

  if (platform === "linux") {
    if (env.SNAP) return { supported: false, reason: "snap" };
    // An AppImage replaces itself; a .deb/.rpm install carries a `package-type` marker written at build time.
    if (env.APPIMAGE) return { supported: true };
    if (resourcesPath && existsSync(path.join(resourcesPath, "package-type"))) return { supported: true };
    return { supported: false, reason: "unmanaged-install" };
  }

  return { supported: false, reason: "platform" };
}

// electron-updater errors can run to many lines (stack, response headers). People get one readable
// sentence; the full text goes to the log.
function friendlyError(err) {
  const raw = String((err && err.message) || err || "Unknown error");
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(raw)) {
    return "Couldn't reach GitHub. Check your internet connection and try again.";
  }
  if (/\b(403|429)\b|rate limit/i.test(raw)) {
    return "GitHub is limiting requests right now. Try again in a few minutes.";
  }
  const firstLine = raw.split("\n")[0].trim();
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine;
}

function createUpdater({
  app,
  BrowserWindow,
  // Returns electron-updater's `autoUpdater`. Called only when this install can update itself, so a
  // dev run or a portable build never even loads it.
  loadAutoUpdater,
  platform = process.platform,
  env = process.env,
  resourcesPath = process.resourcesPath,
  existsSync,
  log = () => {},
  setTimer = setTimeout,
  setRepeating = setInterval,
}) {
  const support = detectSupport({ isPackaged: app.isPackaged, platform, env, resourcesPath, existsSync });

  // status: unsupported | idle | checking | current | available | downloading | downloaded | error
  // error:  null, or { phase: "check" | "download" | "install", message }
  let state = {
    supported: support.supported,
    reason: support.reason || null,
    status: support.supported ? "idle" : "unsupported",
    currentVersion: app.getVersion(),
    version: null,
    percent: null,
    error: null,
  };

  // Say why, so "it opened the website instead of updating" can be diagnosed from the terminal.
  log(support.supported ? "in-place updates are on" : `in-place updates are off for this install (${support.reason})`);

  let autoUpdater = null;
  let phase = "check";
  let backgroundCheck = false;
  let previousStatus = "idle"; // what we were showing before the current check began
  let errorCount = 0; // lets check() tell whether the "error" event already reported a failure
  let installing = false; // a second click on "Restart" while the first is still quitting does nothing
  let started = false;
  const timers = [];

  function setState(patch) {
    state = { ...state, ...patch };
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.changed, state);
    });
  }

  function handleError(err) {
    errorCount += 1;
    log("error during", phase, err);
    const message = friendlyError(err);

    if (phase === "download") {
      // The update is still there to retry, so stay on "available" and say what went wrong.
      setState({ status: "available", percent: null, error: { phase, message } });
      return;
    }
    if (phase === "install") {
      installing = false;
      setState({ status: "downloaded", error: { phase, message } });
      return;
    }

    // phase === "check". A failed check must never hide an update that's already waiting.
    const waiting = previousStatus === "available" || previousStatus === "downloaded";
    const restored = waiting || previousStatus === "current" ? previousStatus : "idle";
    if (backgroundCheck) {
      // Nobody asked for this check (e.g. offline at launch), so don't surface an error for it.
      setState({ status: restored, error: null });
    } else if (waiting) {
      setState({ status: restored, error: { phase, message } });
    } else {
      setState({ status: "error", error: { phase, message } });
    }
  }

  if (support.supported) {
    try {
      autoUpdater = loadAutoUpdater();
      // The person decides when to download; installing happens on restart or the next time Amble closes.
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowDowngrade = false;
      autoUpdater.logger = {
        info: (m) => log("info", m),
        warn: (m) => log("warn", m),
        error: (m) => log("error", m),
        debug: (m) => log("debug", m),
      };

      autoUpdater.on("update-available", (info) => setState({ status: "available", version: info && info.version, percent: null, error: null }));
      autoUpdater.on("update-not-available", () => setState({ status: "current", version: null, percent: null, error: null }));
      autoUpdater.on("download-progress", (p) => setState({ status: "downloading", percent: Math.max(0, Math.min(100, Math.floor((p && p.percent) || 0))), error: null }));
      autoUpdater.on("update-downloaded", (info) => {
        // From here on, anything that goes wrong (including the automatic install when Amble next closes)
        // is an install problem, not a download problem.
        phase = "install";
        setState({ status: "downloaded", version: (info && info.version) || state.version, percent: 100, error: null });
      });
      autoUpdater.on("error", (err) => handleError(err));
    } catch (e) {
      log("couldn't load electron-updater", e);
      autoUpdater = null;
      state = { ...state, supported: false, reason: "unavailable", status: "unsupported" };
    }
  }

  const ready = () => state.supported && autoUpdater;

  async function check({ background = false } = {}) {
    if (!ready()) return state;
    // A check during a check, a download, or with an update already waiting would only confuse things.
    if (["checking", "downloading", "downloaded"].includes(state.status)) return state;

    phase = "check";
    backgroundCheck = background;
    previousStatus = state.status;
    const errorsBefore = errorCount;
    // Background checks stay invisible unless they find something.
    if (!background) setState({ status: "checking", error: null });
    try {
      const result = await autoUpdater.checkForUpdates();
      // electron-updater reports its result through events; this only catches "it did nothing".
      if (state.status === "checking") setState({ status: result ? "current" : "idle" });
    } catch (e) {
      // The "error" event normally got here first and already handled it.
      if (errorCount === errorsBefore) handleError(e);
    } finally {
      backgroundCheck = false;
    }
    return state;
  }

  async function download() {
    if (!ready() || state.status !== "available") return state;
    phase = "download";
    setState({ status: "downloading", percent: 0, error: null });
    const errorsBefore = errorCount;
    try {
      await autoUpdater.downloadUpdate();
    } catch (e) {
      if (errorCount === errorsBefore) handleError(e);
    }
    return state;
  }

  function install() {
    if (!ready() || state.status !== "downloaded" || installing) return state;
    installing = true;
    phase = "install";
    setState({ error: null });
    try {
      // (silent, run-after): swap the build in without installer screens, then reopen Amble. This goes
      // through the normal quit path, so the app's save-on-close still runs first.
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      handleError(e);
    }
    return state;
  }

  function start() {
    if (!ready() || started) return;
    started = true;
    timers.push(setTimer(() => { check({ background: true }); }, FIRST_CHECK_DELAY_MS));
    timers.push(setRepeating(() => { check({ background: true }); }, CHECK_INTERVAL_MS));
    // Never keep the app alive just to run a check.
    timers.forEach((t) => { if (t && typeof t.unref === "function") t.unref(); });
  }

  function stop() {
    timers.splice(0).forEach((t) => { clearTimeout(t); clearInterval(t); });
    started = false;
  }

  return { getState: () => state, check, download, install, start, stop };
}

// None of these take arguments from the renderer, so there is nothing for it to inject.
function registerUpdaterIpc({ ipcMain, updater }) {
  ipcMain.handle(CHANNELS.getState, () => updater.getState());
  ipcMain.handle(CHANNELS.check, async () => { await updater.check(); return updater.getState(); });
  ipcMain.handle(CHANNELS.download, async () => { await updater.download(); return updater.getState(); });
  ipcMain.handle(CHANNELS.install, () => { updater.install(); return updater.getState(); });
}

module.exports = {
  CHANNELS,
  FIRST_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  MAC_IN_PLACE_UPDATES,
  detectSupport,
  friendlyError,
  createUpdater,
  registerUpdaterIpc,
};
