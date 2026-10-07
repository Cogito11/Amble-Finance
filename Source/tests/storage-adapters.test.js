import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileAdapter, createLocalAdapter, createStorage, DATA_KEY_PREFIX, isDataKey, NO_REVISION, tokenOf } from "../Amble/storage";
import { SIDEBAR_KEY, STATUS_KEY, STORAGE_KEY, THEME_KEY, WIDGETS_KEY } from "../Amble/constants";
import { QUARANTINE_KEY } from "../Amble/state/quarantine";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

// localStorage-alike whose stored keys are its own enumerable properties (so Object.keys works, as in a browser).
function fakeLocalStorage({ failSets = false, failGets = false } = {}) {
  const methods = {
    getItem(k) { if (failGets) throw new Error("storage disabled"); return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { if (failSets) throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" }); this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  };
  return Object.create(methods);
}

describe("key routing contract", () => {
  it("every data key the app uses is a 'data' key (file store)", () => {
    for (const key of [STORAGE_KEY, QUARANTINE_KEY, `${STORAGE_KEY}-saved-before-repair-1700000000000`, "vault-finance-migrated-v1"]) {
      expect(isDataKey(key), key).toBe(true);
      expect(key.startsWith(DATA_KEY_PREFIX)).toBe(true);
    }
  });
  it("preference keys are NOT data keys: they stay in localStorage, read synchronously at startup", () => {
    for (const key of [THEME_KEY, WIDGETS_KEY, SIDEBAR_KEY, STATUS_KEY]) expect(isDataKey(key), key).toBe(false);
  });
  it("is safe on non-strings", () => {
    for (const bad of [null, undefined, 5, {}]) expect(isDataKey(bad)).toBe(false);
  });
});

describe("tokenOf", () => {
  it("is deterministic and changes when the content does", () => {
    expect(tokenOf("hello")).toBe(tokenOf("hello"));
    expect(tokenOf("hello")).not.toBe(tokenOf("hellp"));
    expect(tokenOf("")).not.toBe(NO_REVISION);
    expect(tokenOf("ab")).not.toBe(tokenOf("ba"));
  });
});

describe("local adapter", () => {
  it("get: null when missing, value and revision when present", async () => {
    const a = createLocalAdapter(fakeLocalStorage());
    expect(await a.get("k")).toBeNull();
    await a.set("k", "v");
    expect(await a.get("k")).toMatchObject({ key: "k", value: "v", rev: tokenOf("v") });
  });

  it("get THROWS when storage can't be read (not mistaken for 'nothing saved')", async () => {
    await expect(createLocalAdapter(fakeLocalStorage({ failGets: true })).get("k")).rejects.toThrow("storage disabled");
  });

  it("set returns null on failure; write reports the reason", async () => {
    const a = createLocalAdapter(fakeLocalStorage({ failSets: true }));
    expect(await a.set("k", "v")).toBeNull();
    expect(await a.write("k", "v")).toMatchObject({ ok: false, error: { code: "QuotaExceededError", message: "quota exceeded" } });
  });

  it("write is a compare-and-set", async () => {
    const a = createLocalAdapter(fakeLocalStorage());
    const first = await a.write("k", "v1", { expectRev: NO_REVISION });
    expect(first).toMatchObject({ ok: true, rev: tokenOf("v1") });
    expect(await a.write("k", "mine", { expectRev: NO_REVISION })).toMatchObject({ ok: false, conflict: true, value: "v1" }); // someone beat me
    expect(await a.write("k", "v2", { expectRev: first.rev })).toMatchObject({ ok: true });
    expect(await a.write("k", "v2", { expectRev: tokenOf("v2") })).toMatchObject({ ok: true, unchanged: true });
  });

  it("delete and list", async () => {
    const a = createLocalAdapter(fakeLocalStorage());
    await a.set("vault-finance-a", "1"); await a.set("vault-finance-b", "2"); await a.set("other", "3");
    expect((await a.list("vault-finance-")).keys.sort()).toEqual(["vault-finance-a", "vault-finance-b"]);
    await a.delete("vault-finance-a");
    expect((await a.list("vault-finance-")).keys).toEqual(["vault-finance-b"]);
  });

  it("onChange reports other windows' changes and can be stopped", () => {
    const handlers = new Set();
    const target = { addEventListener: (t, h) => handlers.add(h), removeEventListener: (t, h) => handlers.delete(h) };
    const cb = vi.fn();
    const stop = createLocalAdapter(fakeLocalStorage(), target).onChange(cb);
    [...handlers][0]({ key: "k", newValue: "v" });
    expect(cb).toHaveBeenCalledWith({ key: "k", value: "v", rev: tokenOf("v") });
    [...handlers][0]({ key: "k", newValue: null });
    expect(cb).toHaveBeenLastCalledWith({ key: "k", value: null, rev: NO_REVISION });
    stop();
    expect(handlers.size).toBe(0);
  });
});

describe("file adapter (talking to the Electron bridge)", () => {
  const bridge = (overrides = {}) => ({
    get: vi.fn(async () => ({ ok: true, found: false, rev: "none" })),
    write: vi.fn(async () => ({ ok: true, rev: "r1" })),
    writeSync: vi.fn(() => ({ ok: true, rev: "r2" })),
    delete: vi.fn(async () => ({ ok: true, removed: true })),
    list: vi.fn(async () => ({ ok: true, keys: ["a", "b"] })),
    onChange: vi.fn(() => () => {}),
    listBackups: vi.fn(async () => ({ ok: true, backups: [] })),
    readBackup: vi.fn(async () => ({ ok: true, value: "x" })),
    getInfo: vi.fn(async () => ({ ok: true, dir: "/d" })),
    openDataFolder: vi.fn(async () => ({ ok: true })),
    ...overrides,
  });

  it("get: null when missing, value and rev when found", async () => {
    const b = bridge();
    expect(await createFileAdapter(b).get("k")).toBeNull();
    b.get.mockResolvedValueOnce({ ok: true, found: true, value: "v", rev: "rv" });
    expect(await createFileAdapter(b).get("k")).toMatchObject({ key: "k", value: "v", rev: "rv" });
  });

  it("get THROWS with the real reason when the read failed, and when IPC itself fails", async () => {
    const b = bridge({ get: vi.fn(async () => ({ ok: false, error: { code: "EIO", message: "i/o error" } })) });
    await expect(createFileAdapter(b).get("k")).rejects.toMatchObject({ message: "i/o error", code: "EIO" });
    const broken = bridge({ get: vi.fn(async () => { throw new Error("IPC channel closed"); }) });
    await expect(createFileAdapter(broken).get("k")).rejects.toThrow("IPC channel closed");
  });

  it("write passes options through and returns the result untouched (including conflicts)", async () => {
    const b = bridge({ write: vi.fn(async () => ({ ok: false, conflict: true, rev: "r9", value: "theirs" })) });
    const res = await createFileAdapter(b).write("k", "mine", { expectRev: "r1", backupReason: "before-import" });
    expect(b.write).toHaveBeenCalledWith("k", "mine", { expectRev: "r1", backupReason: "before-import" });
    expect(res).toEqual({ ok: false, conflict: true, rev: "r9", value: "theirs" });
  });

  it("write turns an IPC failure into a result, never a throw", async () => {
    const b = bridge({ write: vi.fn(async () => { throw new Error("main process gone"); }) });
    expect(await createFileAdapter(b).write("k", "v")).toMatchObject({ ok: false, error: { message: "main process gone" } });
    expect(createFileAdapter(bridge({ writeSync: () => { throw new Error("nope"); } })).writeSync("k", "v")).toMatchObject({ ok: false });
  });

  it("set / delete / list follow the legacy contract (null on failure)", async () => {
    const bad = bridge({ write: vi.fn(async () => ({ ok: false, error: { code: "ENOSPC", message: "full" } })), delete: vi.fn(async () => ({ ok: false, error: { code: "EIO", message: "x" } })), list: vi.fn(async () => ({ ok: false, error: { code: "EIO", message: "x" } })) });
    const a = createFileAdapter(bad);
    expect(await a.set("k", "v")).toBeNull();
    expect(await a.delete("k")).toBeNull();
    expect(await a.list("p")).toBeNull();
    const good = createFileAdapter(bridge());
    expect(await good.set("k", "v")).toMatchObject({ key: "k", value: "v", rev: "r1" });
    expect(await good.delete("k")).toMatchObject({ deleted: true });
    expect(await good.list("p")).toMatchObject({ keys: ["a", "b"], prefix: "p" });
  });

  it("onChange passes through and returns the unsubscribe function", () => {
    const stop = vi.fn();
    const b = bridge({ onChange: vi.fn(() => stop) });
    const cb = () => {};
    expect(createFileAdapter(b).onChange(cb)).toBe(stop);
    expect(b.onChange).toHaveBeenCalledWith(cb);
  });
});

describe("router", () => {
  const setup = (withBridge = true) => {
    const ls = fakeLocalStorage();
    const bridge = {
      get: vi.fn(async () => ({ ok: true, found: false })), write: vi.fn(async () => ({ ok: true, rev: "r" })), writeSync: vi.fn(), delete: vi.fn(async () => ({ ok: true })),
      list: vi.fn(async () => ({ ok: true, keys: [] })), onChange: vi.fn(() => () => {}), listBackups: vi.fn(), readBackup: vi.fn(), getInfo: vi.fn(), openDataFolder: vi.fn(),
    };
    return { ls, bridge, storage: createStorage({ bridge: withBridge ? bridge : undefined, local: createLocalAdapter(ls) }) };
  };

  it("data keys go to the file store, preference keys stay in localStorage", async () => {
    const { ls, bridge, storage } = setup();
    await storage.write(STORAGE_KEY, "state");
    await storage.set(QUARANTINE_KEY, "q");
    await storage.get(STORAGE_KEY);
    await storage.delete(`${STORAGE_KEY}-saved-x-1`);
    expect(bridge.write).toHaveBeenCalledTimes(2);
    expect(bridge.get).toHaveBeenCalledWith(STORAGE_KEY);
    expect(bridge.delete).toHaveBeenCalledTimes(1);

    bridge.write.mockClear(); bridge.get.mockClear();
    await storage.set(WIDGETS_KEY, "{}");
    await storage.get(THEME_KEY);
    expect(bridge.write).not.toHaveBeenCalled();
    expect(bridge.get).not.toHaveBeenCalled();
    expect(ls[WIDGETS_KEY]).toBe("{}"); // landed in localStorage, where the app reads it at startup
  });

  it("lists data prefixes from the file store and everything else from localStorage", async () => {
    const { bridge, storage } = setup();
    await storage.list(`${STORAGE_KEY}-saved-`);
    expect(bridge.list).toHaveBeenCalledWith(`${STORAGE_KEY}-saved-`);
    bridge.list.mockClear();
    await storage.list("amble-");
    expect(bridge.list).not.toHaveBeenCalled();
  });

  it("exposes file-store extras only when running on the file store", () => {
    const withFile = setup(true).storage;
    expect(withFile.kind).toBe("file");
    for (const fn of ["writeSync", "listBackups", "readBackup", "getInfo", "openDataFolder"]) expect(typeof withFile[fn]).toBe("function");
    const plain = setup(false).storage;
    expect(plain.kind).toBe("local");
    for (const fn of ["writeSync", "listBackups", "readBackup", "getInfo", "openDataFolder"]) expect(plain[fn]).toBeUndefined();
  });

  it("in plain-browser mode everything, data included, uses localStorage", async () => {
    const { ls, storage } = setup(false);
    await storage.write(STORAGE_KEY, "state");
    expect(ls[STORAGE_KEY]).toBe("state");
  });
});
