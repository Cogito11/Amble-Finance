import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATION_MARKER_KEY, migrateLegacyStorage } from "../Amble/state/migration";
import { loadStoredState } from "../Amble/state/loader";
import { STORAGE_KEY, WIDGETS_KEY } from "../Amble/constants";
import { QUARANTINE_KEY } from "../Amble/state/quarantine";
import { NO_REVISION, tokenOf } from "../Amble/storage";
import { defaultState } from "../Amble/state/budgets";
import { fakeStorage, legacyStorage } from "./helpers";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const snapshot = (ls) => JSON.stringify(Object.keys(ls).sort().map((k) => [k, ls[k]]));
const DATA = JSON.stringify({ ...defaultState(), accounts: [{ id: "a", name: "Old checking", type: "checking", startingBalance: 5, order: 0 }] });

describe("migrateLegacyStorage", () => {
  it("copies the data and the other data keys into the file store, and writes the marker", async () => {
    const legacy = legacyStorage({ [STORAGE_KEY]: DATA, [QUARANTINE_KEY]: '{"items":[]}', [`${STORAGE_KEY}-saved-before-repair-1`]: "old copy" });
    const storage = fakeStorage();
    const res = await migrateLegacyStorage(storage, legacy);
    expect(res).toMatchObject({ ran: true, problems: [] });
    expect(res.migrated.sort()).toEqual([QUARANTINE_KEY, STORAGE_KEY, `${STORAGE_KEY}-saved-before-repair-1`].sort());
    expect(storage.data.get(STORAGE_KEY)).toBe(DATA);
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(true);
  });

  it("the loader then finds the migrated data, exactly as before", async () => {
    const storage = fakeStorage();
    await migrateLegacyStorage(storage, legacyStorage({ [STORAGE_KEY]: DATA }));
    const loaded = await loadStoredState(storage);
    expect(loaded.status).toBe("ok");
    expect(loaded.state.accounts[0].name).toBe("Old checking");
    expect(loaded.rev).toBe(tokenOf(DATA));
  });

  it("never touches the old copy (it stays as an extra backup) and ignores preference keys", async () => {
    const legacy = legacyStorage({ [STORAGE_KEY]: DATA, [WIDGETS_KEY]: "{}", "unrelated": "x" });
    const before = snapshot(legacy);
    const storage = fakeStorage();
    await migrateLegacyStorage(storage, legacy);
    expect(snapshot(legacy)).toBe(before);
    expect(storage.data.has(WIDGETS_KEY)).toBe(false);
    expect(storage.data.has("unrelated")).toBe(false);
  });

  it("never overwrites data already in the file store - the file store wins", async () => {
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, "NEWER DATA ALREADY HERE");
    const res = await migrateLegacyStorage(storage, legacyStorage({ [STORAGE_KEY]: DATA }));
    expect(storage.data.get(STORAGE_KEY)).toBe("NEWER DATA ALREADY HERE");
    expect(res.migrated).toEqual([]);
    expect(res.problems).toEqual([]);
  });

  it("runs only once: after 'Start fresh', the old copy does NOT come back", async () => {
    const legacy = legacyStorage({ [STORAGE_KEY]: DATA });
    const storage = fakeStorage();
    await migrateLegacyStorage(storage, legacy);
    await storage.delete(STORAGE_KEY); // the user chose Start fresh
    const again = await migrateLegacyStorage(storage, legacy);
    expect(again.ran).toBe(false);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });

  it("a fresh install with no legacy data just records the marker", async () => {
    const storage = fakeStorage();
    expect(await migrateLegacyStorage(storage, legacyStorage())).toMatchObject({ ran: true, migrated: [], problems: [] });
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(true);
  });

  it("does nothing on the localStorage backend or without a legacy store", async () => {
    expect((await migrateLegacyStorage(fakeStorage({ kind: "local" }), legacyStorage({ [STORAGE_KEY]: DATA }))).ran).toBe(false);
    expect((await migrateLegacyStorage(fakeStorage(), null)).ran).toBe(false);
    expect((await migrateLegacyStorage(null, legacyStorage())).ran).toBe(false);
  });

  it("a failed copy is reported, the marker is NOT written, and the next launch retries and succeeds", async () => {
    const legacy = legacyStorage({ [STORAGE_KEY]: DATA });
    const storage = fakeStorage();
    storage.failWrites(1, { code: "EACCES", message: "permission denied" });
    const first = await migrateLegacyStorage(storage, legacy);
    expect(first.problems).toEqual([{ key: STORAGE_KEY, error: { code: "EACCES", message: "permission denied" } }]);
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(false);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    const second = await migrateLegacyStorage(storage, legacy);
    expect(second.problems).toEqual([]);
    expect(storage.data.get(STORAGE_KEY)).toBe(DATA);
  });

  it("detects a copy that doesn't read back identical", async () => {
    const storage = fakeStorage();
    const realGet = storage.get;
    storage.get = async (key) => { const r = await realGet(key); return r && key === STORAGE_KEY ? { ...r, value: r.value.slice(0, -1) } : r; };
    const res = await migrateLegacyStorage(storage, legacyStorage({ [STORAGE_KEY]: DATA }));
    expect(res.problems[0]).toMatchObject({ key: STORAGE_KEY, error: { code: "EVERIFY" } });
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(false);
  });

  it("tolerates the old storage being unreadable, without writing a marker", async () => {
    const storage = fakeStorage();
    const res = await migrateLegacyStorage(storage, legacyStorage({ [STORAGE_KEY]: DATA }, { failGets: true }));
    expect(res.problems[0]).toMatchObject({ key: STORAGE_KEY });
    expect(storage.data.has(MIGRATION_MARKER_KEY)).toBe(false);
  });

  it("tolerates the file store being unreadable", async () => {
    const res = await migrateLegacyStorage(fakeStorage({ readThrows: true }), legacyStorage({ [STORAGE_KEY]: DATA }));
    expect(res.ran).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("if something else created the key in the meantime, theirs is left alone", async () => {
    const storage = fakeStorage();
    const realGet = storage.get;
    let first = true;
    storage.get = async (key) => { // 'not there' on the first look, then someone writes it
      if (key === STORAGE_KEY && first) { first = false; storage.data.set(STORAGE_KEY, "created by another window"); return null; }
      return realGet(key);
    };
    const res = await migrateLegacyStorage(storage, legacyStorage({ [STORAGE_KEY]: DATA }));
    expect(storage.data.get(STORAGE_KEY)).toBe("created by another window");
    expect(res.problems).toEqual([]);
  });
});

describe("loader returns the revision saves need", () => {
  it("fresh install -> 'none'; existing data -> its revision", async () => {
    expect((await loadStoredState(fakeStorage())).rev).toBe(NO_REVISION);
    const storage = fakeStorage();
    storage.data.set(STORAGE_KEY, DATA);
    expect((await loadStoredState(storage)).rev).toBe(tokenOf(DATA));
  });
});
