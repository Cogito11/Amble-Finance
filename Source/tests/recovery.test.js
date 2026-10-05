import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../Amble/constants";
import { loadStoredState } from "../Amble/state/loader";
import { QUARANTINE_KEY, appendQuarantine, clearQuarantine, quarantineExportText, readQuarantine } from "../Amble/state/quarantine";
import { preserveRawCopy, readRawData, restoreFromBackupText, startFresh } from "../Amble/state/recovery";
import { defaultState } from "../Amble/state/budgets";
import { fakeStorage } from "./helpers";

const goodState = () => {
  const s = defaultState();
  s.accounts = [{ id: "a", name: "Checking", type: "checking", startingBalance: 10, order: 0 }];
  s.transactions = [{ id: "t1", type: "expense", amount: 5, date: "2026-10-01", accountId: "a", description: "x" }];
  return JSON.parse(JSON.stringify(s));
};
const snapshot = (storage) => JSON.stringify([...storage.data.entries()].sort());
const copyKeys = (storage) => [...storage.data.keys()].filter((k) => k.startsWith(`${STORAGE_KEY}-saved-`));

afterEach(() => vi.useRealTimers());

describe("loadStoredState", () => {
  it("nothing saved yet -> a fresh state, and nothing written", async () => {
    const storage = fakeStorage();
    const r = await loadStoredState(storage);
    expect(r.status).toBe("empty");
    expect(r.state.accounts).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it("an empty stored string counts as nothing saved", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "");
    expect((await loadStoredState(storage)).status).toBe("empty");
  });

  it("clean data loads as 'ok' and writes nothing", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, JSON.stringify(goodState()));
    const before = snapshot(storage);
    const r = await loadStoredState(storage);
    expect(r.status).toBe("ok");
    expect(r.state.transactions).toHaveLength(1);
    expect(snapshot(storage)).toBe(before);
  });

  it("unreadable data is reported, not replaced - and storage is left exactly as it was (finding #1)", async () => {
    const storage = fakeStorage();
    const damaged = '{"accounts":[{"id":"a","na';
    storage.data.set(STORAGE_KEY, damaged);
    const before = snapshot(storage);
    const r = await loadStoredState(storage);
    expect(r.status).toBe("unreadable");
    expect(r.rawText).toBe(damaged);
    expect(r.state).toBeUndefined(); // no empty state is offered, so nothing can autosave over it
    expect(snapshot(storage)).toBe(before);
  });

  it.each([["null"], ["[1,2]"], ["42"], ['"text"']])("valid JSON that isn't a state (%s) is unreadable too", async (text) => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, text);
    const before = snapshot(storage);
    expect((await loadStoredState(storage)).status).toBe("unreadable");
    expect(snapshot(storage)).toBe(before);
  });

  it("storage that can't be read at all is unreadable, not 'empty'", async () => {
    const r = await loadStoredState(fakeStorage({ readThrows: true }));
    expect(r.status).toBe("unreadable");
    expect(r.error.message).toBe("storage unavailable");
  });

  it("repairs and set-aside records: the ORIGINAL text is kept verbatim first, and the records are saved", async () => {
    const storage = fakeStorage();
    const s = goodState();
    s.transactions[0].amount = "5.00";
    s.transactions.push({ id: "bad", type: "mystery", amount: 1, date: "2026-10-02" });
    const original = JSON.stringify(s);
    storage.data.set(STORAGE_KEY, original);

    const r = await loadStoredState(storage);
    expect(r.status).toBe("repaired");
    expect(r.state.transactions).toHaveLength(1);
    expect(r.state.transactions[0].amount).toBe(5);
    expect(r.safetyCopyKept).toBe(true);
    expect(r.quarantineSaved).toBe(true);

    const [copyKey] = copyKeys(storage);
    expect(copyKey).toContain("before-repair");
    expect(storage.data.get(copyKey)).toBe(original); // untouched original
    expect(storage.data.get(STORAGE_KEY)).toBe(original); // the loader itself never rewrites it
    const set = await readQuarantine(storage);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({ collection: "transactions", reason: "unknown transaction type", source: "load" });
    expect(set[0].record.id).toBe("bad");
  });

  it("still loads (and says the safety copy failed) when storage is too full to keep one", async () => {
    const s = goodState();
    s.transactions[0].amount = "5";
    const original = JSON.stringify(s);
    const storage = fakeStorage({ quotaBytes: STORAGE_KEY.length + original.length + 10 });
    storage.data.set(STORAGE_KEY, original);
    const r = await loadStoredState(storage);
    expect(r.status).toBe("repaired");
    expect(r.safetyCopyKept).toBe(false);
    expect(storage.data.get(STORAGE_KEY)).toBe(original);
  });
});

describe("quarantine store", () => {
  const item = (n, extra = {}) => ({ collection: "transactions", reason: "no usable amount", record: { id: `r${n}`, ...extra } });

  it("appends, reads back, and clears", async () => {
    const storage = fakeStorage();
    expect(await readQuarantine(storage)).toEqual([]);
    expect((await appendQuarantine([item(1), item(2)], "load", storage)).total).toBe(2);
    expect((await appendQuarantine([item(3)], "import", storage)).total).toBe(3);
    const all = await readQuarantine(storage);
    expect(all.map((x) => x.record.id)).toEqual(["r1", "r2", "r3"]);
    expect(all[2].source).toBe("import");
    expect(await clearQuarantine(storage)).toBe(true);
    expect(await readQuarantine(storage)).toEqual([]);
  });

  it("appending nothing is a no-op", async () => {
    const storage = fakeStorage();
    expect((await appendQuarantine([], "load", storage)).ok).toBe(true);
    expect(storage.data.has(QUARANTINE_KEY)).toBe(false);
  });

  it("keeps only the newest 1000 items", async () => {
    const storage = fakeStorage();
    await appendQuarantine(Array.from({ length: 1200 }, (_, i) => item(i)), "load", storage);
    const all = await readQuarantine(storage);
    expect(all).toHaveLength(1000);
    expect(all[0].record.id).toBe("r200");
    expect(all.at(-1).record.id).toBe("r1199");
  });

  it("stays under its size cap by dropping the oldest", async () => {
    const storage = fakeStorage();
    const big = "x".repeat(100_000);
    await appendQuarantine(Array.from({ length: 30 }, (_, i) => item(i, { blob: big })), "load", storage);
    const stored = storage.data.get(QUARANTINE_KEY);
    expect(stored.length).toBeLessThanOrEqual(1_500_000);
    const all = await readQuarantine(storage);
    expect(all.length).toBeGreaterThan(0);
    expect(all.at(-1).record.id).toBe("r29"); // newest survives
  });

  it("a failed write reports ok:false (without throwing) and leaves existing records alone", async () => {
    const storage = fakeStorage();
    await appendQuarantine([item(1)], "load", storage);
    const tight = fakeStorage({ quotaBytes: storage.data.get(QUARANTINE_KEY).length + QUARANTINE_KEY.length });
    tight.data.set(QUARANTINE_KEY, storage.data.get(QUARANTINE_KEY));
    const res = await appendQuarantine([item(2, { blob: "y".repeat(500) })], "load", tight);
    expect(res.ok).toBe(false);
    expect((await readQuarantine(tight)).map((x) => x.record.id)).toEqual(["r1"]);
  });

  it("export text is readable JSON containing the records", () => {
    const parsed = JSON.parse(quarantineExportText([{ collection: "bills", reason: "no valid due date", record: { id: "b" } }]));
    expect(parsed).toMatchObject({ app: "amble-finance", kind: "set-aside-records" });
    expect(parsed.items[0].record.id).toBe("b");
  });
});

describe("preserveRawCopy", () => {
  it("keeps only the newest three copies", async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    for (let i = 1; i <= 5; i++) {
      vi.setSystemTime(new Date(2026, 9, 1, 12, 0, i));
      expect((await preserveRawCopy(`data-${i}`, "t", storage)).ok).toBe(true);
    }
    const keys = copyKeys(storage);
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => storage.data.get(k)).sort()).toEqual(["data-3", "data-4", "data-5"]);
  });

  it("nothing to preserve is fine", async () => {
    const storage = fakeStorage();
    expect(await preserveRawCopy(null, "t", storage)).toEqual({ ok: true, key: null });
  });

  it("when full, makes room by dropping the OLDEST copy, never the main data", async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "M".repeat(100));
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 1));
    await preserveRawCopy("A".repeat(50), "t", storage);
    const used = [...storage.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const tight = fakeStorage({ quotaBytes: used + 5 });
    storage.data.forEach((v, k) => tight.data.set(k, v));
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 2));
    const res = await preserveRawCopy("B".repeat(50), "t", tight);
    expect(res.ok).toBe(true);
    expect(tight.data.get(STORAGE_KEY)).toBe("M".repeat(100));
    expect(copyKeys(tight).map((k) => tight.data.get(k))).toEqual(["B".repeat(50)]);
  });

  it("reports failure honestly when it truly can't be kept", async () => {
    const storage = fakeStorage({ quotaBytes: 10 });
    expect((await preserveRawCopy("this is far too long to fit", "t", storage)).ok).toBe(false);
  });
});

describe("startFresh", () => {
  it("clears the data only after a safety copy exists", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "precious");
    const r = await startFresh(storage);
    expect(r.ok).toBe(true);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    expect(storage.data.get(r.preservedKey)).toBe("precious");
  });

  it("refuses (and clears nothing) when it can't keep a safety copy", async () => {
    const storage = fakeStorage({ quotaBytes: STORAGE_KEY.length + 8 });
    storage.data.set(STORAGE_KEY, "precious");
    const before = snapshot(storage);
    const r = await startFresh(storage);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Export your data first/);
    expect(snapshot(storage)).toBe(before);
  });

  it("works on an already-empty store", async () => {
    expect((await startFresh(fakeStorage())).ok).toBe(true);
  });
});

describe("restoreFromBackupText", () => {
  const backup = (mut = (s) => s) => JSON.stringify({ app: "amble-finance", version: 1, exportedAt: "x", data: mut(goodState()) });

  it("replaces the data with the validated backup and keeps the old data as a safety copy", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "old unreadable stuff");
    const r = await restoreFromBackupText(backup(), storage);
    expect(r.ok).toBe(true);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)).transactions).toHaveLength(1);
    expect(copyKeys(storage).map((k) => storage.data.get(k))).toEqual(["old unreadable stuff"]);
  });

  it("saves any records it had to set aside", async () => {
    const storage = fakeStorage();
    const r = await restoreFromBackupText(backup((s) => { s.transactions.push({ id: "bad", type: "x", amount: 1 }); return s; }), storage);
    expect(r.ok).toBe(true);
    expect(r.report.quarantinedCount).toBe(1);
    expect((await readQuarantine(storage))[0]).toMatchObject({ source: "restore" });
  });

  it("a file that isn't a backup changes NOTHING", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "current data");
    const before = snapshot(storage);
    for (const text of ["not json", "[]", JSON.stringify({ hello: 1 }), JSON.stringify({ app: "amble-finance", version: 9, data: goodState() })]) {
      const r = await restoreFromBackupText(text, storage);
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe("string");
    }
    expect(snapshot(storage)).toBe(before);
  });

  it("changes nothing if a safety copy can't be kept, or the backup can't be saved", async () => {
    const text = backup();
    const tight = fakeStorage({ quotaBytes: STORAGE_KEY.length + 20 });
    tight.data.set(STORAGE_KEY, "current data");
    const before = snapshot(tight);
    const r = await restoreFromBackupText(text, tight);
    expect(r.ok).toBe(false);
    expect(snapshot(tight)).toBe(before);
  });
});

describe("readRawData", () => {
  it("returns the stored text exactly, or null", async () => {
    const storage = fakeStorage();
    expect(await readRawData(storage)).toBeNull();
    storage.data.set(STORAGE_KEY, "{broken");
    expect(await readRawData(storage)).toBe("{broken");
    expect(await readRawData(fakeStorage({ readThrows: true }))).toBeNull();
  });
});
