import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupList, backupReasonLabel } from "../Amble/components/common/BackupList";
import { RecoveryScreen } from "../Amble/components/common/RecoveryScreen";
import { MoreView } from "../Amble/components/views/MoreView";
import { STORAGE_KEY } from "../Amble/constants";
import { defaultState } from "../Amble/state/budgets";
import { fakeStorage } from "./helpers";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));
const make = (element) => { let r; act(() => { r = TestRenderer.create(element); }); return r; };
const buttonsLabelled = (r, re) => r.root.findAll((n) => n.type === "button" && re.test(textOf(n)));

const backup = (name, reason, size, modifiedMs) => ({ name, reason, size, modifiedMs });
const SAMPLE = [
  backup("20261004-120000-auto.json", "auto", 2048, Date.UTC(2026, 9, 4, 12, 0, 0)),
  backup("20261004-100000-before-import.json", "before-import", 150000, Date.UTC(2026, 9, 4, 10, 0, 0)),
];

describe("BackupList", () => {
  it("shows each backup with a plain-English reason and size, in the order given (newest first)", () => {
    const html = renderToStaticMarkup(<BackupList backups={SAMPLE} onRestore={() => {}} />);
    expect(html.indexOf("Periodic")).toBeLessThan(html.indexOf("Before an import"));
    expect(html).toContain("2.0 KB");
    expect(html).toContain("146.5 KB");
    expect((html.match(/Restore…/g) || []).length).toBe(2);
  });

  it("explains itself when there are none yet", () => {
    const html = renderToStaticMarkup(<BackupList backups={[]} onRestore={() => {}} />);
    expect(html).toContain("No automatic backups yet");
    expect(html).not.toContain("Restore…");
  });

  it("Restore passes the backup back, and can be disabled while busy", () => {
    const onRestore = vi.fn();
    const r = make(<BackupList backups={SAMPLE} onRestore={onRestore} />);
    act(() => buttonsLabelled(r, /Restore/)[1].props.onClick());
    expect(onRestore).toHaveBeenCalledWith(SAMPLE[1]);
    const disabled = make(<BackupList backups={SAMPLE} onRestore={onRestore} disabled />);
    expect(buttonsLabelled(disabled, /Restore/).every((b) => b.props.disabled)).toBe(true);
  });

  it("labels every reason the store can produce", () => {
    expect(backupReasonLabel("launch")).toBe("Start of a session");
    expect(backupReasonLabel("before-restore")).toBe("Before a restore");
    expect(backupReasonLabel("before-delete")).toBe("Before deleting data");
    expect(backupReasonLabel("before-reset")).toBe("Before a reset");
    expect(backupReasonLabel("before-something-new")).toBe("Before a change");
    expect(backupReasonLabel("unknown")).toBe("Automatic");
  });
});

describe("More: data location card", () => {
  const baseProps = { onExportJSON() {}, onImportJSON() {}, onExportCSV() {}, transactionCount: 3, themeMode: "light", onChangeThemeMode() {}, currency: "USD", onChangeCurrency() {}, accountCount: 1, budgetCount: 1, categoryCount: 1, onRefreshCategoryColors() {}, dbSizeBytes: 100, lastBackupAt: null, onDeleteAllTransactions() {}, onDeleteAllBudgets() {}, onDeleteAllCategories() {}, onResetSampleData() {}, onFactoryReset() {}, dashboardWidgets: {}, onToggleWidget() {} };
  const dataTab = (extra) => {
    const r = make(<MoreView {...baseProps} {...extra} />);
    act(() => r.root.findAll((n) => n.type === "button" && n.props.className && n.props.className.includes("seg-btn")).find((n) => /Data/.test(textOf(n))).props.onClick());
    return r;
  };

  it("is hidden when running without the file store", () => {
    expect(textOf(dataTab({}).root)).not.toContain("Data location");
  });

  it("shows where the data lives, lets you open the folder, and lists backups to restore", () => {
    const onOpenDataFolder = vi.fn();
    const onRestoreBackup = vi.fn();
    const r = dataTab({ dataInfo: { dir: "C:\\Users\\me\\AppData\\Roaming\\Amble\\data" }, backups: SAMPLE, onOpenDataFolder, onRestoreBackup });
    const out = textOf(r.root);
    expect(out).toContain("Data location & automatic backups");
    expect(out).toContain("C:\\Users\\me\\AppData\\Roaming\\Amble\\data");
    expect(out).toContain("Before an import");
    act(() => buttonsLabelled(r, /Open data folder/)[0].props.onClick());
    expect(onOpenDataFolder).toHaveBeenCalledTimes(1);
    act(() => buttonsLabelled(r, /Restore/)[0].props.onClick());
    expect(onRestoreBackup).toHaveBeenCalledWith(SAMPLE[0]);
  });
});

describe("RecoveryScreen: restoring an automatic backup", () => {
  let storage;
  const goodText = () => JSON.stringify({ ...defaultState(), accounts: [{ id: "a", name: "From the backup", type: "checking", startingBalance: 1, order: 0 }] });

  beforeEach(() => {
    storage = fakeStorage();
    globalThis.window = globalThis;
    globalThis.storage = storage; // window.storage
    globalThis.localStorage = { getItem: () => null };
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.location = { reload: vi.fn() };
    storage.data.set(STORAGE_KEY, '{"damaged');
  });

  const mount = async (props = { reason: "unreadable", error: new Error("Unexpected end of JSON input") }) => {
    let r;
    await act(async () => { r = TestRenderer.create(<RecoveryScreen {...props} />); });
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    return r;
  };

  it("offers the backups found in the data folder", async () => {
    storage.disk.backups.push({ name: "20261004-120000-auto.json", reason: "auto", size: 900, modifiedMs: Date.UTC(2026, 9, 4, 12), text: goodText() });
    const r = await mount();
    expect(textOf(r.root)).toContain("Restore an automatic backup");
    expect(textOf(r.root)).toContain("Periodic");
  });

  it("offers nothing extra when there are no backups", async () => {
    expect(textOf((await mount()).root)).not.toContain("Restore an automatic backup");
  });

  it("restoring one validates it, keeps the damaged data as a safety copy, and offers to open Amble", async () => {
    storage.disk.backups.push({ name: "20261004-120000-auto.json", reason: "auto", size: 900, modifiedMs: Date.UTC(2026, 9, 4, 12), text: goodText() });
    const r = await mount();
    await act(async () => { buttonsLabelled(r, /Restore…/)[0].props.onClick(); });
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).accounts[0].name).toBe("From the backup");
    expect([...storage.data].some(([k, v]) => k.includes("-saved-before-restore-") && v === '{"damaged')).toBe(true);
    expect(textOf(r.root)).toContain("Backup restored");
    expect(buttonsLabelled(r, /Open Amble/).length).toBe(1);
  });

  it("a backup that turns out to be unreadable changes nothing and says so", async () => {
    storage.disk.backups.push({ name: "20261004-120000-auto.json", reason: "auto", size: 9, modifiedMs: 0, text: "{not a backup" });
    const r = await mount();
    await act(async () => { buttonsLabelled(r, /Restore…/)[0].props.onClick(); });
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    expect(storage.data.get(STORAGE_KEY)).toBe('{"damaged');
    expect(textOf(r.root)).toContain("Nothing was changed");
  });
});
