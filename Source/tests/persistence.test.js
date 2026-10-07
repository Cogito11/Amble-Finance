import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersistence, describeSaveError } from "../Amble/state/persistence";
import { NO_REVISION, tokenOf } from "../Amble/storage";
import { defaultState } from "../Amble/state/budgets";
import { createFakeDisk, fakeStorage } from "./helpers";

const KEY = "vault-finance-data-v1";
const tx = (id, over = {}) => ({ id, type: "expense", amount: 10, date: "2026-10-01", accountId: "a", description: `tx ${id}`, categoryId: null, ...over });
const stateOf = (transactions, over = {}) => ({ ...defaultState(), accounts: [{ id: "a", name: "Checking", type: "checking", startingBalance: 0, order: 0 }], categories: [], plans: [], bills: [], goals: [], transactions, currency: "USD", lastBackupAt: null, ...over });
const ids = (state) => state.transactions.map((t) => t.id).sort();
const onDisk = (storage) => JSON.parse(storage.data.get(KEY));
// Change notifications are handled asynchronously (each one re-reads the stored value); let that all finish.
const settle = async () => { for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// A "window": its own storage view of a shared disk, a persistence controller, and the app state it would hold.
function makeWindow(disk, initial, { rawText, rev } = {}) {
  const storage = fakeStorage({ disk });
  const win = { storage, state: initial, statuses: [], remote: [] };
  win.controller = createPersistence({
    storage, key: KEY,
    onStatus: (s) => win.statuses.push(s),
    onRemoteState: (s, info) => { win.state = s; win.remote.push(info); win.controller.update(s); }, // the app does setState -> effect -> update
  });
  const text = rawText === undefined ? JSON.stringify(initial) : rawText;
  win.controller.init({ state: initial, rawText: text, rev: rev === undefined ? tokenOf(text) : rev });
  storage.onChange((change) => win.controller.receive(change));
  win.edit = (fn) => { win.state = fn(win.state); return win.controller.update(win.state); };
  return win;
}
const seeded = (state = stateOf([tx("t1"), tx("t2")])) => { const disk = createFakeDisk(); disk.data.set(KEY, JSON.stringify(state)); return { disk, state }; };

describe("basic saving", () => {
  it("saves a change, and uses the revision it was given", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3"]);
    expect(w.storage.writes[0].opts.expectRev).toBe(tokenOf(JSON.stringify(state)));
    expect(w.controller.getStatus().state).toBe("saved");
  });

  it("each save is based on the previous save's revision", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t4")] }));
    expect(w.storage.writes[1].opts.expectRev).toBe(tokenOf(w.storage.writes[0].value));
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("does not write when nothing changed (no needless writes, no echo)", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    await w.controller.update(state);
    await w.controller.update({ ...state });
    expect(w.storage.writes).toHaveLength(0);
    expect(w.controller.getStatus().state).toBe("saved");
  });

  it("a fresh install (nothing stored) saves its first state with expectRev 'none'", async () => {
    const disk = createFakeDisk();
    const w = makeWindow(disk, stateOf([]), { rawText: "", rev: NO_REVISION });
    await w.controller.update(w.state);
    expect(w.storage.writes[0].opts.expectRev).toBe(NO_REVISION);
    expect(onDisk(w.storage).transactions).toEqual([]);
  });

  it("repaired data is saved straight away: its text differs from what was on disk", async () => {
    const stored = JSON.stringify({ ...stateOf([tx("t1")]), transactions: [{ ...tx("t1"), amount: "10" }] }); // amount stored as text
    const disk = createFakeDisk();
    disk.data.set(KEY, stored);
    const repaired = stateOf([tx("t1")]); // what the validator produced
    const w = makeWindow(disk, repaired, { rawText: stored });
    await w.controller.update(repaired);
    expect(w.storage.writes).toHaveLength(1);
    expect(onDisk(w.storage).transactions[0].amount).toBe(10);
  });

  it("coalesces rapid changes: only one save in flight, and the LAST state is what ends up stored", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    const edits = [];
    for (let i = 3; i <= 8; i++) edits.push(w.edit((s) => ({ ...s, transactions: [...s.transactions, tx(`t${i}`)] })));
    await Promise.all(edits);
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"]);
    expect(w.storage.writes.length).toBeLessThanOrEqual(3); // not one per change
  });

  it("requestBackup asks the store for a backup on the next save, once", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.controller.requestBackup("before-import");
    await w.edit((s) => ({ ...s, transactions: [tx("imported")] }));
    await w.edit((s) => ({ ...s, transactions: [tx("imported"), tx("more")] }));
    expect(w.storage.writes[0].opts.backupReason).toBe("before-import");
    expect(w.storage.writes[1].opts.backupReason).toBeUndefined();
    expect(w.storage.disk.backups).toHaveLength(1);
  });
});

describe("failed saves are reported and retried (finding #3)", () => {
  it("reports the error, keeps the data in memory, and succeeds on the automatic retry", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(2, { code: "ENOSPC", message: "no space left on device" });
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(w.controller.getStatus()).toMatchObject({ state: "error", message: "the disk (or Amble's storage space) is full", error: { code: "ENOSPC" } });
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2"]); // not saved yet

    await vi.advanceTimersByTimeAsync(3000); // first retry: still failing
    expect(w.controller.getStatus().state).toBe("error");
    await vi.advanceTimersByTimeAsync(10000); // second retry: disk has space again
    expect(w.controller.getStatus().state).toBe("saved");
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3"]);
  });

  it("backs off: 3s, 10s, then every 30s", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(99);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    const attempts = () => w.storage.writes.length;
    expect(attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(2999); expect(attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(1); expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(10000); expect(attempts()).toBe(3);
    await vi.advanceTimersByTimeAsync(30000); expect(attempts()).toBe(4);
    await vi.advanceTimersByTimeAsync(30000); expect(attempts()).toBe(5);
  });

  it("the Retry button saves immediately", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(1);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(w.controller.getStatus().state).toBe("error");
    await w.controller.retry();
    expect(w.controller.getStatus().state).toBe("saved");
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3"]);
  });

  it("changes made while the disk is failing are all saved once it recovers", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(1);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t4")] })); // still failing? (count exhausted -> succeeds)
    await vi.advanceTimersByTimeAsync(3000);
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3", "t4"]);
    expect(w.controller.getStatus().state).toBe("saved");
  });

  it("a full browser quota is reported the same way", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(1, { code: "QuotaExceededError", message: "x" });
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(w.controller.getStatus().message).toMatch(/full/);
  });

  it("describeSaveError gives plain-English reasons", () => {
    expect(describeSaveError({ code: "ENOSPC" })).toMatch(/full/);
    expect(describeSaveError({ code: "EACCES" })).toMatch(/isn't allowed/);
    expect(describeSaveError({ code: "EROFS" })).toMatch(/isn't allowed/);
    expect(describeSaveError({ code: "ECONFLICT" })).toMatch(/another Amble window/);
    expect(describeSaveError({ code: "EUNREADABLE" })).toMatch(/won't overwrite/);
    expect(describeSaveError({ code: "ESTOREUNAVAILABLE", message: "folder is locked" })).toBe("folder is locked");
    expect(describeSaveError({ code: "WEIRD", message: "custom" })).toBe("custom");
    expect(describeSaveError(null)).toBe("an unknown problem");
  });

  it("an unreadable stored copy is never overwritten (the save is refused and the cause is reported)", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    disk.data.set(KEY, "{ this was edited outside Amble and is broken"); // changed behind our back
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(w.controller.getStatus()).toMatchObject({ state: "error", error: { code: "EUNREADABLE" } });
    expect(disk.data.get(KEY)).toBe("{ this was edited outside Amble and is broken");
  });

  it("stops (no endless loop) if another window keeps changing the data", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    let n = 0;
    w.storage._write = (key, value, opts) => { // every attempt hits a fresh conflict
      w.storage.writes.push({ key, value, opts });
      const theirs = JSON.stringify(stateOf([tx("t1"), tx("t2"), tx(`other-${++n}`)]));
      return { ok: false, conflict: true, rev: tokenOf(theirs), value: theirs };
    };
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("mine")] }));
    expect(w.controller.getStatus()).toMatchObject({ state: "error", error: { code: "ECONFLICT" } });
    expect(w.storage.writes.length).toBeLessThanOrEqual(7);
  });

  it("if the stored copy was deleted elsewhere, our copy is written back", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    disk.data.delete(KEY);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    expect(ids(onDisk(w.storage))).toEqual(["t1", "t2", "t3"]);
  });
});

describe("several windows (finding #4)", () => {
  it("two windows add a transaction at the same moment: BOTH survive, and both windows end up identical", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    disk.deferEvents = true; // neither hears about the other's save in time
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-A")] }));
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-B")] })); // refused, merged, re-saved
    disk.deferEvents = false; disk.deliverAll();
    await vi.runAllTimersAsync();
    expect(ids(onDisk(A.storage))).toEqual(["from-A", "from-B", "t1", "t2"]);
    expect(ids(A.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
    expect(ids(B.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
    expect(B.remote.some((r) => r.merged)).toBe(true);
  });

  it("the lost-update scenario with the OLD behaviour would have lost A's change (control)", async () => {
    // A blind overwrite (no expectRev) is what the old autosave did.
    const { disk, state } = seeded();
    const storage = fakeStorage({ disk });
    await storage.set(KEY, JSON.stringify(stateOf([...state.transactions, tx("from-A")])));
    await storage.set(KEY, JSON.stringify(stateOf([...state.transactions, tx("from-B")]))); // B overwrites without noticing
    expect(ids(onDisk(storage))).toEqual(["from-B", "t1", "t2"]); // from-A is gone
  });

  it("normal use: an edit in one window appears in the other, with no echo writes", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    await settle();
    expect(ids(B.state)).toEqual(["t1", "t2", "t3"]);
    expect(B.remote).toEqual([{ merged: false }]);
    expect(B.storage.writes).toHaveLength(0); // B just adopted it; it did not write it back
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t4")] }));
    await settle();
    expect(ids(A.state)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(A.storage.writes).toHaveLength(1); // only A's own edit
  });

  it("an unsaved edit in this window is merged (not overwritten) when the other window's change arrives", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    B.storage.failWrites(1);
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-B")] })); // B's save fails; edit only in memory
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-A")] })); // arrives at B while it has an unsaved edit
    await settle();
    expect(ids(B.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
    await vi.runAllTimersAsync();
    expect(ids(onDisk(A.storage))).toEqual(["from-A", "from-B", "t1", "t2"]);
    expect(ids(A.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
  });

  it("different fields of the same record edited in two windows are both kept", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    disk.deferEvents = true;
    await A.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 99 } : t)) }));
    await B.edit((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === "t1" ? { ...t, description: "renamed" } : t)) }));
    disk.deferEvents = false; disk.deliverAll(); await vi.runAllTimersAsync();
    const t1 = onDisk(A.storage).transactions.find((t) => t.id === "t1");
    expect(t1).toMatchObject({ amount: 99, description: "renamed" });
  });

  it("ten rapid edits split between two windows with delayed notifications: nothing is lost", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    disk.deferEvents = true;
    for (let i = 0; i < 5; i++) {
      await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx(`a${i}`)] }));
      await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx(`b${i}`)] }));
    }
    disk.deferEvents = false; disk.deliverAll(); await vi.runAllTimersAsync();
    const expected = ["t1", "t2", ...Array.from({ length: 5 }, (_, i) => `a${i}`), ...Array.from({ length: 5 }, (_, i) => `b${i}`)].sort();
    expect(ids(onDisk(A.storage))).toEqual(expected);
    expect(ids(A.state)).toEqual(expected);
    expect(ids(B.state)).toEqual(expected);
  });

  it("ignores changes to other keys, and stored values it can't read (it never adopts garbage)", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    await A.controller.receive({ key: "vault-finance-other", value: "{}", rev: "x" });
    disk.data.set(KEY, "not json");
    await A.controller.receive({ key: KEY, rev: "x" });
    disk.data.set(KEY, JSON.stringify([1, 2])); // valid JSON, but not a state
    await A.controller.receive({ key: KEY, rev: "y" });
    expect(A.remote).toEqual([]);
    expect(ids(A.state)).toEqual(["t1", "t2"]);
  });

  it("a stale notification can never roll newer data back (race found while testing)", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    disk.deferEvents = true;
    await A.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-A")] }));
    await B.edit((s) => ({ ...s, transactions: [...s.transactions, tx("from-B")] })); // merges A's change itself, saves
    const afterMerge = disk.data.get(KEY);
    // A's notification only reaches B now - long after B already merged that change.
    disk.deferEvents = false; disk.deliverAll();
    await settle();
    expect(disk.data.get(KEY)).toBe(afterMerge); // nothing was rolled back or rewritten
    expect(ids(B.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
    // even a notification carrying an old payload is judged against the current stored value
    await B.controller.receive({ key: KEY, value: JSON.stringify(state), rev: "old-revision" });
    expect(disk.data.get(KEY)).toBe(afterMerge);
    expect(ids(B.state)).toEqual(["from-A", "from-B", "t1", "t2"]);
  });

  it("a value identical to what we already have is ignored", async () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    await A.controller.receive({ key: KEY, value: JSON.stringify(state), rev: "x" });
    expect(A.remote).toEqual([]);
  });
});

describe("saving while the window closes", () => {
  it("flushSync saves unsaved changes synchronously", () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.state = { ...state, transactions: [...state.transactions, tx("last-second")] };
    w.controller.update(w.state); // async save begins but hasn't completed
    expect(w.controller.flushSync()).toBe(true);
    expect(w.storage.writeSyncCalls).toBe(1);
    expect(ids(onDisk(w.storage))).toEqual(["last-second", "t1", "t2"]);
  });

  it("does nothing when everything is already saved", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    expect(w.controller.flushSync()).toBe(true);
    expect(w.storage.writeSyncCalls).toBe(0);
  });

  it("merges if another window saved first, then writes", () => {
    const { disk, state } = seeded();
    const A = makeWindow(disk, state);
    const B = makeWindow(disk, state);
    disk.deferEvents = true;
    A.controller.update({ ...state, transactions: [...state.transactions, tx("from-A")] });
    const bState = { ...state, transactions: [...state.transactions, tx("from-B")] };
    B.state = bState; B.controller.update(bState);
    expect(A.storage.writes.length + B.storage.writes.length).toBeGreaterThan(0);
    expect(B.controller.flushSync()).toBe(true);
    expect(ids(onDisk(B.storage))).toEqual(expect.arrayContaining(["from-B", "t1", "t2"]));
  });

  it("returns false (and the app can warn) when the synchronous write fails", () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(5);
    w.controller.update({ ...state, transactions: [...state.transactions, tx("x")] });
    expect(w.controller.flushSync()).toBe(false);
  });

  it("is a safe no-op on a backend without writeSync (plain-browser mode)", () => {
    const disk = createFakeDisk();
    const storage = fakeStorage({ disk, kind: "local" });
    delete storage.writeSync;
    const c = createPersistence({ storage, key: KEY });
    c.init({ state: stateOf([]), rawText: "", rev: NO_REVISION });
    expect(c.flushSync()).toBe(false);
  });
});

describe("stopping", () => {
  it("stop() cancels retries and further saves", async () => {
    const { disk, state } = seeded();
    const w = makeWindow(disk, state);
    w.storage.failWrites(1);
    await w.edit((s) => ({ ...s, transactions: [...s.transactions, tx("t3")] }));
    w.controller.stop();
    const before = w.storage.writes.length;
    await vi.advanceTimersByTimeAsync(60000);
    await w.controller.update({ ...state, transactions: [tx("later")] });
    expect(w.storage.writes.length).toBe(before);
  });
});
