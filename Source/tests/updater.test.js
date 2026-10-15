import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  CHANNELS, FIRST_CHECK_DELAY_MS, CHECK_INTERVAL_MS, MAC_IN_PLACE_UPDATES,
  detectSupport, friendlyError, createUpdater, registerUpdaterIpc,
} = require("../updater.js");

// A stand-in for electron-updater's autoUpdater: an EventEmitter whose operations the test controls.
function fakeAutoUpdater() {
  const au = new EventEmitter();
  au.checkForUpdates = vi.fn(async () => ({ updateInfo: {} }));
  au.downloadUpdate = vi.fn(async () => []);
  au.quitAndInstall = vi.fn();
  return au;
}

const fakeWindow = (destroyed = false) => ({ webContents: { send: vi.fn() }, isDestroyed: () => destroyed });

function setup({ isPackaged = true, platform = "win32", env = {}, existsSync = () => false, autoUpdater = fakeAutoUpdater(), loadFails = false } = {}) {
  const windows = [fakeWindow(), fakeWindow(), fakeWindow(true)];
  const loadAutoUpdater = vi.fn(() => { if (loadFails) throw new Error("module missing"); return autoUpdater; });
  const updater = createUpdater({
    app: { isPackaged, getVersion: () => "1.7.2" },
    BrowserWindow: { getAllWindows: () => windows },
    loadAutoUpdater,
    platform,
    env,
    resourcesPath: "/opt/Amble/resources",
    existsSync,
    log: () => {},
  });
  return { updater, autoUpdater, windows, loadAutoUpdater };
}

const sentStates = (win) => win.webContents.send.mock.calls.map(([channel, state]) => { expect(channel).toBe(CHANNELS.changed); return state.status; });

describe("detectSupport", () => {
  const base = { isPackaged: true, env: {}, resourcesPath: "/r", existsSync: () => false };

  it("a development run never updates itself", () => {
    expect(detectSupport({ ...base, isPackaged: false, platform: "win32" })).toEqual({ supported: false, reason: "dev" });
  });

  it("Windows installer: yes. Portable .exe: no (there is no installer to replace)", () => {
    expect(detectSupport({ ...base, platform: "win32" }).supported).toBe(true);
    expect(detectSupport({ ...base, platform: "win32", env: { PORTABLE_EXECUTABLE_FILE: "C:\\x\\Amble.exe" } })).toEqual({ supported: false, reason: "portable" });
  });

  it("Linux: AppImage yes; .deb/.rpm yes (package-type marker); anything else no", () => {
    expect(detectSupport({ ...base, platform: "linux", env: { APPIMAGE: "/home/me/Amble.AppImage" } }).supported).toBe(true);
    expect(detectSupport({ ...base, platform: "linux", existsSync: (p) => p.endsWith("package-type") }).supported).toBe(true);
    expect(detectSupport({ ...base, platform: "linux" })).toEqual({ supported: false, reason: "unmanaged-install" });
    expect(detectSupport({ ...base, platform: "linux", env: { SNAP: "1" } }).supported).toBe(false);
  });

  it("macOS follows MAC_IN_PLACE_UPDATES (off until the builds are code-signed)", () => {
    expect(detectSupport({ ...base, platform: "darwin" }).supported).toBe(MAC_IN_PLACE_UPDATES);
  });
});

describe("friendlyError", () => {
  it("turns network failures and rate limits into plain sentences", () => {
    expect(friendlyError(new Error("net::ERR_INTERNET_DISCONNECTED"))).toMatch(/internet connection/);
    expect(friendlyError(new Error("getaddrinfo ENOTFOUND github.com"))).toMatch(/internet connection/);
    expect(friendlyError(new Error("HttpError: 403 rate limit exceeded"))).toMatch(/limiting requests/);
  });
  it("keeps only the first line of a long error and caps its length", () => {
    expect(friendlyError(new Error("Cannot find latest.yml\n  at stack...\n  headers: {...}"))).toBe("Cannot find latest.yml");
    expect(friendlyError(new Error("x".repeat(500))).length).toBeLessThanOrEqual(200);
  });
});

describe("an install that can't update itself", () => {
  it("reports unsupported, never loads electron-updater, and ignores every request", async () => {
    const { updater, autoUpdater, loadAutoUpdater } = setup({ isPackaged: false });
    expect(updater.getState()).toMatchObject({ supported: false, reason: "dev", status: "unsupported" });
    await updater.check();
    await updater.download();
    updater.install();
    updater.start();
    expect(loadAutoUpdater).not.toHaveBeenCalled();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.getState().status).toBe("unsupported");
  });

  it("if electron-updater itself can't be loaded, degrades to unsupported instead of crashing", () => {
    const { updater } = setup({ loadFails: true });
    expect(updater.getState()).toMatchObject({ supported: false, reason: "unavailable", status: "unsupported" });
  });
});

describe("the update flow", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("configures electron-updater so nothing downloads without the person's say-so", () => {
    expect(ctx.autoUpdater.autoDownload).toBe(false);
    expect(ctx.autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(ctx.autoUpdater.allowDowngrade).toBe(false);
  });

  it("starts idle with the running version", () => {
    expect(ctx.updater.getState()).toMatchObject({ supported: true, status: "idle", currentVersion: "1.7.2", version: null, error: null });
  });

  it("check -> available -> download (with progress) -> downloaded -> install", async () => {
    const { updater, autoUpdater, windows } = ctx;
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    await updater.check();
    expect(updater.getState()).toMatchObject({ status: "available", version: "1.8.0" });

    autoUpdater.downloadUpdate.mockImplementation(async () => {
      autoUpdater.emit("download-progress", { percent: 41.7 });
      autoUpdater.emit("update-downloaded", { version: "1.8.0" });
      return [];
    });
    await updater.download();
    expect(updater.getState()).toMatchObject({ status: "downloaded", version: "1.8.0", percent: 100 });

    updater.install();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);

    // every live window heard each step; the destroyed one was skipped
    expect(sentStates(windows[0])).toEqual(["checking", "available", "downloading", "downloading", "downloaded", "downloaded"]);
    expect(windows[1].webContents.send).toHaveBeenCalledTimes(windows[0].webContents.send.mock.calls.length);
    expect(windows[2].webContents.send).not.toHaveBeenCalled();
  });

  it("progress is a whole number between 0 and 100", async () => {
    const { updater, autoUpdater } = ctx;
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    await updater.check();
    let seen;
    autoUpdater.downloadUpdate.mockImplementation(async () => {
      autoUpdater.emit("download-progress", { percent: 99.99 });
      seen = updater.getState().percent;
      autoUpdater.emit("download-progress", { percent: 250 });
      expect(updater.getState().percent).toBe(100);
      return [];
    });
    await updater.download();
    expect(seen).toBe(99);
  });

  it("already up to date -> 'current'", async () => {
    const { updater, autoUpdater } = ctx;
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-not-available", { version: "1.7.2" }); return {}; });
    await updater.check();
    expect(updater.getState()).toMatchObject({ status: "current", version: null });
  });

  it("a check that does nothing (electron-updater returned null) doesn't leave 'checking' stuck", async () => {
    ctx.autoUpdater.checkForUpdates.mockResolvedValue(null);
    await ctx.updater.check();
    expect(ctx.updater.getState().status).toBe("idle");
  });

  it("only downloads when there is an update, and only installs once it's downloaded", async () => {
    const { updater, autoUpdater } = ctx;
    await updater.download(); // idle
    updater.install(); // idle
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("overlapping checks, or a check while downloading or with an update ready, run only once", async () => {
    const { updater, autoUpdater } = ctx;
    let release;
    autoUpdater.checkForUpdates.mockImplementation(() => new Promise((r) => { release = () => { autoUpdater.emit("update-available", { version: "1.8.0" }); r({}); }; }));
    const first = updater.check();
    await updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    release();
    await first;

    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    await updater.download();
    await updater.check(); // update already downloaded
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("a double-click on Restart only installs once, and a failed install can be retried", async () => {
    const { updater, autoUpdater } = ctx;
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    await updater.check();
    await updater.download();
    updater.install();
    updater.install();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);

    // if that attempt fails, the guard resets so "Try again" works
    autoUpdater.emit("error", new Error("installer failed to start"));
    updater.install();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
  });
});

describe("failures", () => {
  it("a failed manual check reports an error (and the IPC layer never throws)", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => {
      const e = new Error("net::ERR_INTERNET_DISCONNECTED");
      autoUpdater.emit("error", e); // electron-updater emits AND rejects
      throw e;
    });
    await expect(updater.check()).resolves.toBeDefined();
    expect(updater.getState()).toMatchObject({ status: "error", error: { phase: "check" } });
    expect(updater.getState().error.message).toMatch(/internet connection/);
  });

  it("a rejection with no 'error' event is still caught", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockRejectedValue(new Error("boom"));
    await updater.check();
    expect(updater.getState()).toMatchObject({ status: "error", error: { phase: "check", message: "boom" } });
  });

  it("an error can be retried", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("boom"));
    await updater.check();
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-not-available", {}); return {}; });
    await updater.check();
    expect(updater.getState()).toMatchObject({ status: "current", error: null });
  });

  it("a failed download goes back to 'available' (with the error) so it can be retried", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    await updater.check();
    autoUpdater.downloadUpdate.mockImplementation(async () => { const e = new Error("sha512 checksum mismatch"); autoUpdater.emit("error", e); throw e; });
    await updater.download();
    expect(updater.getState()).toMatchObject({ status: "available", version: "1.8.0", percent: null, error: { phase: "download", message: "sha512 checksum mismatch" } });

    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    await updater.download();
    expect(updater.getState()).toMatchObject({ status: "downloaded", error: null });
  });

  it("a failed install stays on 'downloaded' so the person can try again", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    await updater.check();
    await updater.download();
    autoUpdater.quitAndInstall.mockImplementation(() => { throw new Error("pkexec was dismissed"); });
    updater.install();
    expect(updater.getState()).toMatchObject({ status: "downloaded", error: { phase: "install", message: "pkexec was dismissed" } });
  });

  it("an error after the download finished (e.g. the install when Amble next closes) is an install error", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    await updater.check();
    await updater.download();
    autoUpdater.emit("error", new Error("could not replace the old version"));
    expect(updater.getState()).toMatchObject({ status: "downloaded", error: { phase: "install", message: "could not replace the old version" } });
  });

  it("a failed re-check never hides an update that is already waiting", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    await updater.check();
    autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    await updater.check();
    expect(updater.getState()).toMatchObject({ status: "available", version: "1.8.0", error: { phase: "check" } });
  });
});

describe("background checks", () => {
  let timers;
  beforeEach(() => { vi.useFakeTimers(); timers = []; });
  afterEach(() => vi.useRealTimers());

  it("run once shortly after launch, then every few hours, and only start once", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-not-available", {}); return {}; });
    updater.start();
    updater.start();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled(); // never at launch itself
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    updater.stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("are invisible while they run, and a failure (offline at launch) leaves no error behind", async () => {
    const { updater, autoUpdater, windows } = setup();
    autoUpdater.checkForUpdates.mockImplementation(async () => { const e = new Error("net::ERR_INTERNET_DISCONNECTED"); autoUpdater.emit("error", e); throw e; });
    updater.start();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS);
    expect(updater.getState()).toMatchObject({ status: "idle", error: null });
    expect(sentStates(windows[0])).not.toContain("checking");
    expect(sentStates(windows[0])).not.toContain("error");
  });

  it("a background re-check failing keeps an already-found update on screen", async () => {
    const { updater, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    await updater.check();
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => { const e = new Error("offline"); autoUpdater.emit("error", e); throw e; });
    await updater.check({ background: true });
    expect(updater.getState()).toMatchObject({ status: "available", version: "1.8.0", error: null });
  });

  it("an unsupported install schedules nothing", async () => {
    const { updater, autoUpdater } = setup({ isPackaged: false });
    updater.start();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
});

describe("IPC", () => {
  it("exposes exactly the four channels, each returning the current state", async () => {
    const { updater, autoUpdater } = setup();
    const handlers = {};
    registerUpdaterIpc({ ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } }, updater });
    expect(Object.keys(handlers).sort()).toEqual([CHANNELS.check, CHANNELS.download, CHANNELS.getState, CHANNELS.install].sort());

    expect(await handlers[CHANNELS.getState]()).toMatchObject({ status: "idle" });
    autoUpdater.checkForUpdates.mockImplementation(async () => { autoUpdater.emit("update-available", { version: "1.8.0" }); return {}; });
    expect(await handlers[CHANNELS.check]()).toMatchObject({ status: "available", version: "1.8.0" });
    autoUpdater.downloadUpdate.mockImplementation(async () => { autoUpdater.emit("update-downloaded", { version: "1.8.0" }); return []; });
    expect(await handlers[CHANNELS.download]()).toMatchObject({ status: "downloaded" });
    expect(await handlers[CHANNELS.install]()).toMatchObject({ status: "downloaded" });
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
