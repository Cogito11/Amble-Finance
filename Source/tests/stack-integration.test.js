import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../Amble/constants";
import { createLocalAdapter, createStorage } from "../Amble/storage";
import { createPersistence } from "../Amble/state/persistence";
import { loadStoredState } from "../Amble/state/loader";
import { migrateLegacyStorage } from "../Amble/state/migration";
import { restoreFromBackupText } from "../Amble/state/recovery";
import { defaultState } from "../Amble/state/budgets";
import { legacyStorage } from "./helpers";

// The real stack, minus Electron itself: the real file store writing real files, the real IPC handlers,
// the real renderer storage adapters and the real persistence controllers, in two simulated windows.
// What's faked: ipcMain / BrowserWindow (a handler table and an in-process message hop).

const require = createRequire(import.meta.url);
const { createFileStore } = require("../store/fileStore.js");
const { registerStoreIpc } = require("../store/ipc.js");

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "amble-stack-")); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

const settle = () => new Promise((r) => setTimeout(r, 15));

function makeStack({ fsImpl } = {}) {
  const store = createFileStore({ dir, fs: fsImpl, now: Date.now });
  const handlers = {};
  const listeners = {};
  const windows = [];
  const stack = { hold: false, held: [], store };
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; }, on: (ch, fn) => { listeners[ch] = fn; } };
  registerStoreIpc({ ipcMain, BrowserWindow: { getAllWindows: () => windows }, shell: { openPath: async () => "" }, store });

  stack.openWindow = () => {
    const subscribers = new Set();
    const deliver = (payload) => subscribers.forEach((cb) => cb(payload));
    const win = {
      isDestroyed: () => false,
      webContents: { send: (channel, payload) => {
        const hop = () => Promise.resolve().then(() => deliver(payload)); // IPC is asynchronous
        if (stack.hold) stack.held.push(hop); else hop();
      } },
    };
    windows.push(win);
    const sender = win.webContents;
    const bridge = {
      get: (k) => handlers["store:get"]({ sender }, k),
      write: (k, v, o) => handlers["store:write"]({ sender }, k, v, o),
      writeSync: (k, v, o) => { const e = { sender }; listeners["store:write-sync"](e, k, v, o); return e.returnValue; },
      delete: (k) => handlers["store:delete"]({ sender }, k),
      list: (p) => handlers["store:list"]({ sender }, p),
      listBackups: () => handlers["store:list-backups"]({ sender }),
      readBackup: (n) => handlers["store:read-backup"]({ sender }, n),
      getInfo: () => handlers["store:info"]({ sender }),
      openDataFolder: () => handlers["store:open-folder"]({ sender }),
      onChange: (cb) => { subscribers.add(cb); return () => subscribers.delete(cb); },
    };
    const storage = createStorage({ bridge, local: createLocalAdapter(legacyStorage()) });
    return storage;
  };
  stack.release = async () => { stack.hold = false; const run = stack.held.splice(0); run.forEach((fn) => fn()); await settle(); };
  return stack;
}

const tx = (id, over = {}) => ({ id, type: "expense", amount: 10, date: "2026-10-01", accountId: "a", description: `tx ${id}`, categoryId: null, ...over });
const stateOf = (transactions, over = {}) => ({ ...defaultState(), accounts: [{ id: "a", name: "Checking", type: "checking", startingBalance: 0, order: 0 }], categories: [], plans: [], bills: [], goals: [], transactions, currency: "USD", lastBackupAt: null, ...over });
const ids = (state) => state.transactions.map((t) => t.id).sort();
const storedState = () => JSON.parse(fs.readFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), "utf8"));

// A window like App's: loads, then reports every change to a persistence controller.
async function openAppWindow(stack) {
  const storage = stack.openWindow();
  const loaded = await loadStoredState(storage);
  const win = { storage, state: loaded.state, statuses: [] };
  win.controller = createPersistence({
    storage, key: STORAGE_KEY,
    onStatus: (s) => win.statuses.push(s),
    onRemoteState: (s) => { win.state = s; win.controller.update(s); },
  });
  win.controller.init({ state: loaded.state, rawText: loaded.rawText, rev: loaded.rev });
  storage.onChange((change) => win.controller.receive(change));
  win.edit = (fn) => { win.state = fn(win.state); return win.controller.update(win.state); };
  win.status = () => win.controller.getStatus().state;
  return win;
}

describe("two windows on real files", () => {
  it("a fresh install saves its first state to a real, readable file", async () => {
    const stack = makeStack();
    const A = await openAppWindow(stack);
    expect(A.state.accounts).toEqual(defaultState().accounts);
    await A.edit((s) => ({ ...s, transactions: [tx("t1")] }));
    expect(storedState().transactions.map((t) => t.id)).toEqual(["t1"]);
  });

  it("edits in one window reach the other through the real store, with no echo writes", async () => {
    fs.mkdirSync(path.join(dir, "store"), { recursive: true });
    fs.writeFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), JSON.stringify(stateOf([tx("t1")])));
    const stack = makeStack();
    const A = await openAppWindow(stack);
    const B = await openAppWindow(stack);
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t2")] }));
    await settle();
    expect(ids(B.state)).toEqual(["t1", "t2"]);
    const filesBefore = fs.readdirSync(path.join(dir, "backups")).length;
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    await settle();
    expect(ids(A.state)).toEqual(["t1", "t2", "t3"]);
    expect(ids(storedState())).toEqual(["t1", "t2", "t3"]);
    expect(fs.readdirSync(path.join(dir, "backups")).length).toBeGreaterThanOrEqual(filesBefore);
  });

  it("both windows edit at the same moment (notifications delayed): nothing is lost on disk, and both converge", async () => {
    fs.mkdirSync(path.join(dir, "store"), { recursive: true });
    fs.writeFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), JSON.stringify(stateOf([tx("t1"), tx("t2")])));
    const stack = makeStack();
    const A = await openAppWindow(stack);
    const B = await openAppWindow(stack);
    stack.hold = true; // neither hears about the other in time
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-A")] }));
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-B")] }));
    await stack.release();
    await settle();
    const expected = ["from-A", "from-B", "t1", "t2"];
    expect(ids(storedState())).toEqual(expected);
    expect(ids(A.state)).toEqual(expected);
    expect(ids(B.state)).toEqual(expected);
  });

  it("the file on disk is never left half-written, and is always valid JSON, across a burst of concurrent edits", async () => {
    fs.mkdirSync(path.join(dir, "store"), { recursive: true });
    fs.writeFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), JSON.stringify(stateOf([tx("t0")])));
    const stack = makeStack();
    const A = await openAppWindow(stack);
    const B = await openAppWindow(stack);
    stack.hold = true;
    const work = [];
    for (let i = 0; i < 15; i++) {
      work.push(A.edit((s) => ({ ...s, transactions: [...s.transactions, tx(`a${i}`)] })));
      work.push(B.edit((s) => ({ ...s, transactions: [...s.transactions, tx(`b${i}`)] })));
      JSON.parse(fs.readFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), "utf8")); // valid at every instant
    }
    await Promise.all(work);
    await stack.release();
    await settle();
    expect(ids(storedState())).toHaveLength(31);
    expect(ids(A.state)).toEqual(ids(storedState()));
    expect(ids(B.state)).toEqual(ids(storedState()));
    expect(fs.readdirSync(path.join(dir, "store")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

describe("a failing disk", () => {
  it("the user's data stays intact, the failure is reported with its reason, and saving resumes when the disk recovers", async () => {
    fs.mkdirSync(path.join(dir, "store"), { recursive: true });
    const original = JSON.stringify(stateOf([tx("t1")]));
    fs.writeFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), original);

    let diskFull = true;
    const faulty = { ...fs, writeSync: (...args) => { if (diskFull && String(args[0]).length >= 0 && args.length === 4) throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" }); return fs.writeSync(...args); } };
    const stack = makeStack({ fsImpl: faulty });
    const A = await openAppWindow(stack);
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t2")] }));

    expect(A.controller.getStatus()).toMatchObject({ state: "error", message: "the disk (or Amble's storage space) is full" });
    expect(fs.readFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), "utf8")).toBe(original); // untouched
    expect(ids(A.state)).toEqual(["t1", "t2"]); // still safe in memory

    diskFull = false;
    await A.controller.retry();
    expect(A.status()).toBe("saved");
    expect(ids(storedState())).toEqual(["t1", "t2"]);
  });
});

describe("recovering a damaged file from an automatic backup (the full journey)", () => {
  it("edit -> file gets damaged outside the app -> app reports it, never overwrites it -> restore from backup -> data is back", async () => {
    // A session of normal use: the second change creates the 'launch' backup of the first version.
    const stack = makeStack();
    const A = await openAppWindow(stack);
    await A.edit((s) => ({ ...s, transactions: [tx("precious-1")] }));
    await A.edit((s) => ({ ...s, transactions: [tx("precious-1"), tx("precious-2")] }));
    expect(ids(storedState())).toEqual(["precious-1", "precious-2"]);
    A.controller.stop();

    // The main data file gets truncated (a disk problem, an editor, whatever).
    const file = path.join(dir, "store", `${STORAGE_KEY}.json`);
    fs.writeFileSync(file, '{"accounts":[{"id":"a","na');

    // Next launch: the loader says unreadable and writes nothing.
    const storage = makeStack().openWindow();
    const loaded = await loadStoredState(storage);
    expect(loaded.status).toBe("unreadable");
    expect(fs.readFileSync(file, "utf8")).toBe('{"accounts":[{"id":"a","na');

    // The recovery screen lists automatic backups; restoring one validates it and keeps a safety copy of the damaged file.
    const { backups } = await storage.listBackups();
    expect(backups.length).toBeGreaterThan(0);
    const read = await storage.readBackup(backups[0].name);
    expect(read.ok).toBe(true);
    const restored = await restoreFromBackupText(read.value, storage);
    expect(restored.ok).toBe(true);

    const reloaded = await loadStoredState(storage);
    expect(reloaded.status).not.toBe("unreadable");
    // The backup was taken just before the second change, so it holds exactly the first version.
    expect(ids(reloaded.state)).toEqual(["precious-1"]);
    const safety = fs.readdirSync(path.join(dir, "store")).filter((n) => n.includes("-saved-before-restore-"));
    expect(safety).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, "store", safety[0]), "utf8")).toBe('{"accounts":[{"id":"a","na'); // the damaged file is kept too
  });

  it("deleting the data (Start fresh) leaves a backup behind", async () => {
    const stack = makeStack();
    const A = await openAppWindow(stack);
    await A.edit((s) => ({ ...s, transactions: [tx("keep-me")] }));
    A.controller.stop();
    await A.storage.delete(STORAGE_KEY);
    const backups = fs.readdirSync(path.join(dir, "backups"));
    expect(backups.some((n) => n.endsWith("-before-delete.json"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "backups", backups.find((n) => n.endsWith("-before-delete.json"))), "utf8")).toContain("keep-me");
  });
});

describe("upgrading from the old localStorage storage, on real files", () => {
  it("moves existing data into the real store, once, leaving the old copy alone", async () => {
    const old = JSON.stringify(stateOf([tx("from-old-version")]));
    const legacy = legacyStorage({ [STORAGE_KEY]: old });
    const storage = makeStack().openWindow();
    const result = await migrateLegacyStorage(storage, legacy);
    expect(result.problems).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "store", `${STORAGE_KEY}.json`), "utf8")).toBe(old);
    expect(legacy[STORAGE_KEY]).toBe(old);
    expect((await loadStoredState(storage)).state.transactions[0].id).toBe("from-old-version");
    // once only
    fs.rmSync(path.join(dir, "store", `${STORAGE_KEY}.json`));
    expect((await migrateLegacyStorage(storage, legacy)).ran).toBe(false);
    expect(fs.existsSync(path.join(dir, "store", `${STORAGE_KEY}.json`))).toBe(false);
  });
});
