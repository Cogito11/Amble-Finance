import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createFileStore, PRIMARY_KEY } = require("../store/fileStore.js");
const { registerStoreIpc, sanitizeOptions } = require("../store/ipc.js");
const root = path.join(__dirname, "..");

let dir, handlers, listeners, windows, shell;
const fakeWindow = (destroyed = false) => ({ webContents: { send: vi.fn() }, isDestroyed: () => destroyed });

function setup({ withStore = true } = {}) {
  handlers = {};
  listeners = {};
  windows = { main: fakeWindow(), popout: fakeWindow(), dead: fakeWindow(true) };
  shell = { openPath: vi.fn(async () => "") };
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { listeners[ch] = fn; } };
  const BrowserWindow = { getAllWindows: () => Object.values(windows) };
  const store = withStore ? createFileStore({ dir }) : null;
  registerStoreIpc({ ipcMain, BrowserWindow, shell, store, unavailableReason: "folder is locked" });
  return store;
}
const eventFrom = (win) => ({ sender: win.webContents });
const invoke = (channel, sender, ...args) => handlers[channel](eventFrom(sender), ...args);

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "amble-ipc-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("store IPC", () => {
  it("round-trips a value through the handlers", async () => {
    setup();
    const w = await invoke("store:write", windows.main, PRIMARY_KEY, "hello", {});
    expect(w.ok).toBe(true);
    expect(await invoke("store:get", windows.main, PRIMARY_KEY)).toMatchObject({ ok: true, found: true, value: "hello", rev: w.rev });
  });

  it("tells every OTHER window about a change - never the one that made it, never a destroyed one", async () => {
    setup();
    const w = await invoke("store:write", windows.main, PRIMARY_KEY, "v1", {});
    expect(windows.popout.webContents.send).toHaveBeenCalledWith("store:changed", { key: PRIMARY_KEY, value: "v1", rev: w.rev });
    expect(windows.main.webContents.send).not.toHaveBeenCalled();
    expect(windows.dead.webContents.send).not.toHaveBeenCalled();
  });

  it("does not broadcast when nothing changed, or when the write was refused", async () => {
    setup();
    const first = await invoke("store:write", windows.main, PRIMARY_KEY, "v1", {});
    windows.popout.webContents.send.mockClear();
    await invoke("store:write", windows.main, PRIMARY_KEY, "v1", {}); // identical
    await invoke("store:write", windows.main, PRIMARY_KEY, "v2", { expectRev: "stale-revision" }); // conflict
    expect(windows.popout.webContents.send).not.toHaveBeenCalled();
    expect(first.ok).toBe(true);
  });

  it("a conflicting write returns the current value so the caller can merge", async () => {
    setup();
    const a = await invoke("store:write", windows.main, PRIMARY_KEY, "A's version", { expectRev: "none" });
    const b = await invoke("store:write", windows.popout, PRIMARY_KEY, "B's version", { expectRev: "none" });
    expect(b).toMatchObject({ ok: false, conflict: true, value: "A's version", rev: a.rev });
  });

  it("the synchronous (window-closing) write behaves the same and sets the return value", () => {
    setup();
    const event = { sender: windows.main.webContents, returnValue: undefined };
    listeners["store:write-sync"](event, PRIMARY_KEY, "last words", {});
    expect(event.returnValue).toMatchObject({ ok: true });
    expect(windows.popout.webContents.send).toHaveBeenCalled();
  });

  it("deleting broadcasts a null value", async () => {
    setup();
    await invoke("store:write", windows.main, PRIMARY_KEY, "v1", {});
    windows.popout.webContents.send.mockClear();
    expect(await invoke("store:delete", windows.main, PRIMARY_KEY)).toMatchObject({ ok: true, removed: true });
    expect(windows.popout.webContents.send).toHaveBeenCalledWith("store:changed", { key: PRIMARY_KEY, value: null, rev: "none" });
  });

  it("only passes the two allowed options through", () => {
    expect(sanitizeOptions({ expectRev: "r", backupReason: "before-import", evil: "x", __proto__: { a: 1 } })).toEqual({ expectRev: "r", backupReason: "before-import" });
    expect(sanitizeOptions({ expectRev: 5, backupReason: {} })).toEqual({});
    expect(sanitizeOptions(null)).toEqual({});
    expect(sanitizeOptions("string")).toEqual({});
  });

  it("bad input comes back as an error object, never a thrown exception", async () => {
    setup();
    expect(await invoke("store:get", windows.main, "../etc/passwd")).toMatchObject({ ok: false, error: { code: "EINVALIDKEY" } });
    expect(await invoke("store:write", windows.main, "ok-key", { not: "a string" }, {})).toMatchObject({ ok: false });
    expect(await invoke("store:read-backup", windows.main, "../../secret")).toMatchObject({ ok: false });
    expect(await invoke("store:list", windows.main, 42)).toMatchObject({ ok: true });
  });

  it("lists and reads backups", async () => {
    setup();
    await invoke("store:write", windows.main, PRIMARY_KEY, "v0", {});
    await invoke("store:write", windows.main, PRIMARY_KEY, "v1", {});
    const { backups } = await invoke("store:list-backups", windows.main);
    expect(backups).toHaveLength(1);
    expect(await invoke("store:read-backup", windows.main, backups[0].name)).toEqual({ ok: true, value: "v0" });
  });

  it("reports the data folder, and opens it in the file manager", async () => {
    setup();
    expect((await invoke("store:info", windows.main)).dir).toBe(dir);
    expect(await invoke("store:open-folder", windows.main)).toEqual({ ok: true });
    expect(shell.openPath).toHaveBeenCalledWith(dir);
    shell.openPath.mockResolvedValueOnce("No application knows how to open this");
    expect(await invoke("store:open-folder", windows.main)).toMatchObject({ ok: false, error: { code: "EOPEN" } });
  });

  it("if the data folder couldn't be opened, every call says so honestly (and nothing throws)", async () => {
    setup({ withStore: false });
    for (const [channel, args] of [["store:get", ["k"]], ["store:write", ["k", "v", {}]], ["store:delete", ["k"]], ["store:list", [""]], ["store:list-backups", []], ["store:info", []], ["store:open-folder", []]]) {
      expect(await invoke(channel, windows.main, ...args), channel).toMatchObject({ ok: false, error: { code: "ESTOREUNAVAILABLE", message: "folder is locked" } });
    }
  });
});

describe("packaging: everything the main process needs is shipped", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const patterns = pkg.build.files.filter((p) => !p.startsWith("!"));
  const covered = (rel) => patterns.some((p) => (p.endsWith("/**/*") ? rel.startsWith(p.slice(0, -4)) : p === rel));

  const localRequires = (file) => {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    return [...text.matchAll(/require\(\s*["'](\.[^"']+)["']\s*\)/g)].map((m) => {
      const resolved = path.normalize(path.join(path.dirname(file), m[1]));
      return fs.existsSync(path.join(root, resolved)) ? resolved : `${resolved}.js`;
    });
  };

  it("main.js, preload.js and every local file they require (transitively) are in build.files", () => {
    const seen = new Set();
    const queue = ["main.js", "preload.js"];
    while (queue.length) {
      const file = queue.pop().replace(/\\/g, "/");
      if (seen.has(file)) continue;
      seen.add(file);
      expect(fs.existsSync(path.join(root, file)), `${file} should exist`).toBe(true);
      expect(covered(file), `${file} is required at runtime but is NOT listed in package.json build.files, so the packaged app would crash on launch`).toBe(true);
      queue.push(...localRequires(file));
    }
    expect([...seen]).toEqual(expect.arrayContaining(["main.js", "preload.js", "store/fileStore.js", "store/ipc.js"]));
  });

  it("the guard itself works (a file outside the whitelist is not covered)", () => {
    expect(covered("store/fileStore.js")).toBe(true);
    expect(covered("tests/helpers.js")).toBe(false);
    expect(covered("secret.js")).toBe(false);
  });
});
