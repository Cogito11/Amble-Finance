import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../Amble/constants";
import { QUARANTINE_KEY } from "../Amble/state/quarantine";
import { defaultState } from "../Amble/state/budgets";
import { fakeStorage } from "./helpers";

// Drives the REAL <App/> (not a copy of its logic) with a stubbed browser, to prove the wiring:
// what the app does with unreadable data, repaired data, and imported backups.

let storage;
let App, MoreView, ConfirmDialog;

function installBrowser() {
  const local = new Map();
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) };
  globalThis.window.storage = storage;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.location = { search: "", href: "http://localhost/", reload() {} };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.document = { title: "", activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: () => ({ click() {}, style: {} }), body: {}, documentElement: { style: {} } };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = fakeStorage();
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
    expect([...storage.data.keys()].filter((k) => !k.startsWith("amble-"))).toEqual([STORAGE_KEY]);
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
