import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../Amble/constants";
import { QUARANTINE_KEY } from "../Amble/state/quarantine";
import { defaultState } from "../Amble/state/budgets";
import { MIGRATION_MARKER_KEY } from "../Amble/state/migration";
import { createFakeDisk, fakeStorage, legacyStorage } from "./helpers";

// Drives the REAL <App/> (not a copy of its logic) with a stubbed browser, to prove the wiring:
// what the app does with unreadable data, repaired data, and imported backups.

let storage;
let App, MoreView, ConfirmDialog;
let windowHandlers; // event listeners the app registered on window (e.g. beforeunload)
let legacy;

function installBrowser() {
  globalThis.window = globalThis;
  globalThis.localStorage = legacy;
  globalThis.window.storage = storage;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.location = { search: "", href: "http://localhost/", reload() {} };
  globalThis.addEventListener = (type, fn) => { (windowHandlers[type] = windowHandlers[type] || []).push(fn); };
  globalThis.removeEventListener = (type, fn) => { windowHandlers[type] = (windowHandlers[type] || []).filter((f) => f !== fn); };
  globalThis.document = { title: "", activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: () => ({ click() {}, style: {} }), body: {}, documentElement: { style: {} } };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = fakeStorage();
  windowHandlers = {};
  legacy = legacyStorage();
  // Import BEFORE faking a browser: react-dom (pulled in by the chart library) detects a DOM at
  // import time, and would then try to use our minimal stub. The stubs are only needed at render.
  ({ default: App } = await import("../Amble/App"));
  ({ MoreView } = await import("../Amble/components/views/MoreView"));
  ({ ConfirmDialog } = await import("../Amble/components/common/ConfirmDialog"));
  installBrowser();
});
afterEach(() => vi.restoreAllMocks());

const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };
async function mount() {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(<App />); });
  await settle();
  return renderer;
}
const snapshot = () => JSON.stringify([...storage.data.entries()].sort());

const goodState = () => {
  const s = defaultState();
  s.accounts = [{ id: "a", name: "Checking", type: "checking", startingBalance: 10, order: 0 }];
  s.transactions = [{ id: "t1", type: "expense", amount: 5, date: "2026-10-01", accountId: "a", description: "coffee" }];
  return JSON.parse(JSON.stringify(s));
};

describe("<App/> startup", () => {
  it("unreadable saved data -> recovery screen, and NOTHING is ever written to storage (finding #1)", async () => {
    const damaged = '{"accounts":[{"id":"a","na';
    storage.data.set(STORAGE_KEY, damaged);
    const r = await mount();
    expect(textOf(r.root)).toContain("We couldn't read your saved data");
    expect(textOf(r.root)).toContain("Export my data");
    await settle(); // give an autosave every chance to (wrongly) fire
    expect(storage.data.get(STORAGE_KEY)).toBe(damaged); // the unreadable data is exactly as it was
    // The only other keys allowed to appear are UI preferences (amble-*: widgets, sidebar...), which
    // the app writes on every start. No data, safety-copy or set-aside keys may be created or changed.
    // (The one-time migration records its marker; that's bookkeeping, not data.)
    expect([...storage.data.keys()].filter((k) => !k.startsWith("amble-") && k !== MIGRATION_MARKER_KEY)).toEqual([STORAGE_KEY]);
  });

  it("a fresh install starts empty and saves normally", async () => {
    const r = await mount();
    expect(textOf(r.root)).not.toContain("couldn't read");
    expect(storage.data.has(STORAGE_KEY)).toBe(true); // autosave works as before
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts).toEqual([]);
  });

  it("clean saved data loads untouched, with no notice", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    expect(textOf(r.root)).not.toContain("while opening your data");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).transactions).toHaveLength(1);
  });

  it("repairable data loads, shows what happened, keeps the original and the set-aside records", async () => {
    const s = goodState();
    s.transactions[0].amount = "5.00";
    s.transactions.push({ id: "bad", type: "mystery", amount: 1, date: "2026-10-02" });
    const original = JSON.stringify(s);
    storage.data.set(STORAGE_KEY, original);
    const r = await mount();

    const text = textOf(r.root);
    expect(text).toContain("repaired 1 record and set aside 1 that couldn't be read while opening your data");
    expect(text).toContain("Export set-aside records");
    expect(text).toContain("kept as a safety copy");

    const copyKey = [...storage.data.keys()].find((k) => k.includes("before-repair"));
    expect(storage.data.get(copyKey)).toBe(original); // verbatim original
    expect(storage.data.has(QUARANTINE_KEY)).toBe(true);
    const saved = JSON.parse(storage.data.get(STORAGE_KEY));
    expect(saved.transactions).toHaveLength(1);
    expect(saved.transactions[0].amount).toBe(5); // repaired version is what's now saved
  });
});

describe("<App/> import", () => {
  const goToMore = async (r) => {
    const more = r.root.findAll((n) => n.type === "button" && /^More$/.test(textOf(n).trim()))[0];
    await act(async () => { more.props.onClick(); });
  };
  const fileOf = (name, text) => ({ name, text: async () => text });
  const backup = (mut = (s) => s) => JSON.stringify({ app: "amble-finance", version: 1, exportedAt: "x", data: mut(goodState()) });
  const dialog = (r) => r.root.findByType(ConfirmDialog).props;

  it("a file that isn't a backup is rejected, and nothing changes", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    const before = snapshot();
    await act(async () => { r.root.findByType(MoreView).props.onImportJSON(fileOf("junk.json", "{not json")); });
    await settle();
    expect(dialog(r).title).toBe("Import failed");
    expect(dialog(r).message).toMatch(/isn't valid JSON/);
    expect(dialog(r).message).toMatch(/No changes were made/);
    await act(async () => { dialog(r).onConfirm(); });
    await settle();
    expect(snapshot()).toBe(before);
  });

  it("a backup from a newer version is refused", async () => {
    const r = await mount();
    await goToMore(r);
    await act(async () => { r.root.findByType(MoreView).props.onImportJSON(fileOf("new.json", JSON.stringify({ app: "amble-finance", version: 99, data: goodState() }))); });
    await settle();
    expect(dialog(r).title).toBe("Import failed");
    expect(dialog(r).message).toMatch(/newer version/);
  });

  it("a good backup: the dialog says what's in it first, and only confirming replaces the data", async () => {
    const r = await mount();
    await goToMore(r);
    await act(async () => { r.root.findByType(MoreView).props.onImportJSON(fileOf("mine.json", backup())); });
    await settle();
    const d = dialog(r);
    expect(d.title).toBe("Import backup?");
    expect(d.message).toContain("1 account, 1 transaction");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).transactions).toEqual([]); // not applied yet

    await act(async () => { await d.onConfirm(); });
    await settle();
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).transactions).toHaveLength(1);
    // the store was asked to keep a backup of what was replaced
    expect(storage.writes.some((w) => w.key === STORAGE_KEY && w.opts.backupReason === "before-import")).toBe(true);
  });

  it("a backup with damaged records: the dialog says so, the good data imports, the bad records are saved aside", async () => {
    const r = await mount();
    await goToMore(r);
    const text = backup((s) => { s.transactions[0].amount = "5"; s.transactions.push({ id: "bad", type: "x", amount: 1 }); return s; });
    await act(async () => { r.root.findByType(MoreView).props.onImportJSON(fileOf("dirty.json", text)); });
    await settle();
    const d = dialog(r);
    expect(d.message).toContain("repaired 1 record and set aside 1 that couldn't be read");
    await act(async () => { await d.onConfirm(); });
    await settle();
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).transactions).toHaveLength(1);
    expect(JSON.parse(storage.data.get(QUARANTINE_KEY)).items[0].record.id).toBe("bad");
    expect(textOf(r.root)).toContain("Backup imported");
  });
});


describe("<App/> saving", () => {
  const MoreProps = (r) => r.root.findByType(MoreView).props;
  const goToMore = async (r) => {
    const more = r.root.findAll((n) => n.type === "button" && /^More$/.test(textOf(n).trim()))[0];
    await act(async () => { more.props.onClick(); });
  };

  it("saves through the controller: the first save of a fresh install is based on revision 'none'", async () => {
    await mount();
    const first = storage.writes.find((w) => w.key === STORAGE_KEY);
    expect(first.opts.expectRev).toBe("none");
  });

  it("a failed save shows a clear banner, keeps the app usable, and Retry fixes it (finding #3)", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    storage.failWrites(1, { code: "ENOSPC", message: "no space left on device" });
    await act(async () => { MoreProps(r).onChangeCurrency("EUR"); });
    await settle();
    expect(textOf(r.root)).toContain("Amble couldn't save your latest changes");
    expect(textOf(r.root)).toContain("the disk (or Amble's storage space) is full");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).currency).not.toBe("EUR"); // genuinely not saved

    const retry = r.root.findAll((n) => n.type === "button" && /Retry now/.test(textOf(n)))[0];
    await act(async () => { retry.props.onClick(); });
    await settle();
    expect(textOf(r.root)).not.toContain("couldn't save your latest changes");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).currency).toBe("EUR");
  });

  it("the banner offers an export so the data can be rescued while saving is broken", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    storage.failWrites(99);
    await act(async () => { MoreProps(r).onChangeCurrency("EUR"); });
    await settle();
    expect(r.root.findAll((n) => n.type === "button" && /Export backup/.test(textOf(n))).length).toBeGreaterThan(0);
  });

  it("another window's change appears in this one (shown in the net worth)", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    expect(textOf(r.root)).toContain("$5.00"); // net worth: the account's $10.00 minus its one $5.00 expense

    const other = fakeStorage({ disk: storage.disk }); // a second window on the same disk
    const theirs = goodState();
    theirs.accounts.push({ id: "b", name: "Savings", type: "savings", startingBalance: 1000, order: 1 });
    const text = JSON.stringify(theirs);
    await act(async () => { await other.write(STORAGE_KEY, text, { expectRev: (await other.get(STORAGE_KEY)).rev }); });
    await settle();
    expect(textOf(r.root)).toContain("$1,005.00"); // + the other window's new $1,000 account
  });

  it("this window's unsaved change is merged with another window's, not overwritten", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    storage.failWrites(1);
    await act(async () => { MoreProps(r).onChangeCurrency("EUR"); }); // this window: unsaved (save failed)
    await settle();

    const other = fakeStorage({ disk: storage.disk });
    const theirs = goodState();
    theirs.accounts.push({ id: "b", name: "Savings", type: "savings", startingBalance: 1000, order: 1 });
    await act(async () => { await other.write(STORAGE_KEY, JSON.stringify(theirs), { expectRev: (await other.get(STORAGE_KEY)).rev }); });
    await settle();

    const saved = JSON.parse(storage.data.get(STORAGE_KEY));
    expect(saved.currency).toBe("EUR"); // ours survived
    expect(saved.accounts.map((a) => a.id).sort()).toEqual(["a", "b"]); // theirs survived
    expect(textOf(r.root)).not.toContain("couldn't save your latest changes");
  });

  it("closing the window saves any unsaved change synchronously", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    expect(windowHandlers.beforeunload && windowHandlers.beforeunload.length).toBeGreaterThan(0);
    storage.failWrites(1);
    await act(async () => { MoreProps(r).onChangeCurrency("EUR"); });
    await settle(); // the async save failed; the change exists only in memory
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).currency).not.toBe("EUR");
    windowHandlers.beforeunload.forEach((fn) => fn()); // the window is closing
    expect(storage.writeSyncCalls).toBe(1);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).currency).toBe("EUR");
  });

  it("destructive actions ask the store for a backup first", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const r = await mount();
    await goToMore(r);
    await act(async () => { MoreProps(r).onFactoryReset(); });
    await act(async () => { await r.root.findByType(ConfirmDialog).props.onConfirm(); });
    await settle();
    const resetWrite = storage.writes.filter((w) => w.key === STORAGE_KEY).pop();
    expect(resetWrite.opts.backupReason).toBe("before-reset");
    expect(storage.disk.backups.some((b) => b.reason === "before-reset" && b.text.includes("Checking"))).toBe(true);
  });
});

describe("<App/> first launch after upgrading (moving data out of the old storage)", () => {
  it("existing data is copied over and the app opens normally; the old copy is left untouched", async () => {
    const original = JSON.stringify(goodState());
    legacy.setItem(STORAGE_KEY, original);
    const r = await mount();
    expect(textOf(r.root)).not.toContain("couldn't");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts[0].name).toBe("Checking");
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(true);
    expect(legacy[STORAGE_KEY]).toBe(original);
  });

  it("if the copy fails, the app does NOT start empty (which would strand the old data): it says so", async () => {
    const original = JSON.stringify(goodState());
    legacy.setItem(STORAGE_KEY, original);
    storage.failWrites(1, { code: "EACCES", message: "permission denied" });
    const r = await mount();
    expect(textOf(r.root)).toContain("couldn't move your saved data into its new storage location");
    expect(textOf(r.root)).toContain("permission denied");
    expect(storage.data.has(STORAGE_KEY)).toBe(false); // nothing blank was written over the future location
    expect(legacy[STORAGE_KEY]).toBe(original); // the old data is exactly where it was
    expect(storage.writes.filter((w) => w.key === STORAGE_KEY && w.opts.expectRev === "none" && w.value !== original)).toEqual([]);
  });

  it("trying again after the problem clears completes the move", async () => {
    const original = JSON.stringify(goodState());
    legacy.setItem(STORAGE_KEY, original);
    storage.failWrites(1, { code: "EACCES", message: "permission denied" });
    await mount();
    // "Try again" reloads the page: a brand-new App instance with the same storage and the same old data.
    const r = await mount();
    expect(textOf(r.root)).not.toContain("couldn't move");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts[0].name).toBe("Checking");
  });
});

describe("<App/> restoring an automatic backup", () => {
  it("validates it, states what's in it, keeps a backup of the current data, then replaces", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const older = goodState();
    older.accounts[0].name = "Checking (from backup)";
    storage.disk.backups.push({ name: "20260101-000000-launch.json", reason: "launch", size: 1234, modifiedMs: 1767225600000, text: JSON.stringify(older) });

    const r = await mount();
    await act(async () => { r.root.findAll((n) => n.type === "button" && /^More$/.test(textOf(n).trim()))[0].props.onClick(); });
    await settle();
    const props = r.root.findByType(MoreView).props;
    expect(props.backups.map((b) => b.name)).toContain("20260101-000000-launch.json");
    expect(props.dataInfo.dir).toBe("/fake/data");

    await act(async () => { props.onRestoreBackup(props.backups[0]); });
    await settle();
    const dialog = r.root.findByType(ConfirmDialog).props;
    expect(dialog.title).toBe("Restore automatic backup?");
    expect(dialog.message).toContain("1 account, 1 transaction");
    expect(dialog.message).toContain("A backup of your current data is kept first");
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts[0].name).toBe("Checking"); // not applied yet

    await act(async () => { await dialog.onConfirm(); });
    await settle();
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts[0].name).toBe("Checking (from backup)");
    expect(storage.disk.backups.some((b) => b.reason === "before-restore" && b.text.includes('"Checking"'))).toBe(true);
    expect(textOf(r.root)).toContain("Backup restored");
  });

  it("an unreadable backup is refused with no changes", async () => {
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    storage.disk.backups.push({ name: "20260101-000000-launch.json", reason: "launch", size: 3, modifiedMs: 1767225600000, text: "{garbage" });
    const r = await mount();
    await act(async () => { r.root.findAll((n) => n.type === "button" && /^More$/.test(textOf(n).trim()))[0].props.onClick(); });
    await settle();
    const before = storage.data.get(STORAGE_KEY);
    await act(async () => { r.root.findByType(MoreView).props.onRestoreBackup({ name: "20260101-000000-launch.json", modifiedMs: 0 }); });
    await settle();
    expect(r.root.findByType(ConfirmDialog).props.title).toBe("Restore failed");
    expect(storage.data.get(STORAGE_KEY)).toBe(before);
  });
});
