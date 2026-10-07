import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "../Amble/constants";

const require = createRequire(import.meta.url);
const { createFileStore, PRIMARY_KEY, NONE, AUTO_BACKUP_INTERVAL_MS, KEEP_ROUTINE_BACKUPS, KEEP_BEFORE_BACKUPS } = require("../store/fileStore.js");

let dir;
let clock;
const makeStore = (overrides = {}) => createFileStore({ dir, now: () => clock, ...overrides });
const storeFile = (key) => path.join(dir, "store", `${key}.json`);
const backupFiles = () => fs.readdirSync(path.join(dir, "backups")).sort();
const tmpFiles = () => fs.readdirSync(path.join(dir, "store")).filter((n) => n.endsWith(".tmp"));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "amble-store-"));
  clock = Date.UTC(2026, 9, 4, 12, 0, 0);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

// A real filesystem with chosen operations made to fail, to simulate a full disk, a locked file...
function faultyFs(faults) {
  const wrapped = { ...fs };
  for (const [method, fault] of Object.entries(faults)) {
    let calls = 0;
    wrapped[method] = (...args) => {
      calls++;
      const decision = fault(calls, args);
      if (decision) throw Object.assign(new Error(decision.message || decision.code), { code: decision.code });
      return fs[method](...args);
    };
  }
  return wrapped;
}

describe("the store agrees with the app on the main key", () => {
  it("PRIMARY_KEY matches STORAGE_KEY in constants.js", () => {
    expect(PRIMARY_KEY).toBe(STORAGE_KEY);
  });
});

describe("get / write", () => {
  it("a missing key is reported as not found, with the 'none' revision", () => {
    expect(makeStore().get("vault-finance-x")).toEqual({ ok: true, found: false, rev: NONE });
  });

  it("round-trips a value exactly, as a plain readable file", () => {
    const store = makeStore();
    const value = JSON.stringify({ accounts: [{ name: "Café ☕ — 日本" }] });
    const w = store.write(PRIMARY_KEY, value);
    expect(w.ok).toBe(true);
    const g = store.get(PRIMARY_KEY);
    expect(g).toMatchObject({ ok: true, found: true, value, rev: w.rev });
    expect(fs.readFileSync(storeFile(PRIMARY_KEY), "utf8")).toBe(value); // inspectable by the user
  });

  it("writing identical content is a no-op (nothing rewritten, no broadcast needed)", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "same");
    const before = fs.statSync(storeFile(PRIMARY_KEY)).mtimeMs;
    expect(store.write(PRIMARY_KEY, "same")).toMatchObject({ ok: true, unchanged: true });
    expect(fs.statSync(storeFile(PRIMARY_KEY)).mtimeMs).toBe(before);
  });

  it("rejects non-string values and oversize values with an error, not a crash", () => {
    const store = makeStore();
    expect(store.write("vault-finance-x", { a: 1 })).toMatchObject({ ok: false, error: { code: "EINVALIDVALUE" } });
    expect(store.write("vault-finance-x", "x".repeat(64 * 1024 * 1024 + 1))).toMatchObject({ ok: false, error: { code: "EFBIG" } });
    expect(store.get("vault-finance-x").found).toBe(false);
  });
});

describe("key safety (keys become file names)", () => {
  it.each([["../evil"], ["a/b"], ["a\\b"], [".hidden"], [""], ["x".repeat(201)], ["has space"], [null], [42]])("rejects %j", (key) => {
    const store = makeStore();
    expect(store.get(key)).toMatchObject({ ok: false, error: { code: "EINVALIDKEY" } });
    expect(store.write(key, "v")).toMatchObject({ ok: false, error: { code: "EINVALIDKEY" } });
    expect(store.delete(key)).toMatchObject({ ok: false });
  });

  it("nothing is ever written outside the store folder", () => {
    const store = makeStore();
    store.write("..", "v");
    store.write("../escape", "v");
    expect(fs.existsSync(path.join(dir, "escape.json"))).toBe(false);
    expect(fs.readdirSync(path.join(dir, "store"))).toEqual([]);
  });
});

describe("compare-and-set revisions (safe with several windows)", () => {
  it("writes when the expected revision matches, and the new revision follows", () => {
    const store = makeStore();
    const first = store.write(PRIMARY_KEY, "v1", { expectRev: NONE });
    expect(first.ok).toBe(true);
    const second = store.write(PRIMARY_KEY, "v2", { expectRev: first.rev });
    expect(second.ok).toBe(true);
    expect(second.rev).not.toBe(first.rev);
  });

  it("refuses a stale write and hands back the current value instead - nothing is overwritten", () => {
    const store = makeStore();
    const base = store.write(PRIMARY_KEY, "base", { expectRev: NONE });
    store.write(PRIMARY_KEY, "window A's change", { expectRev: base.rev }); // window A wins the race
    const stale = store.write(PRIMARY_KEY, "window B's change", { expectRev: base.rev }); // B still thinks it's at 'base'
    expect(stale).toMatchObject({ ok: false, conflict: true, value: "window A's change" });
    expect(fs.readFileSync(storeFile(PRIMARY_KEY), "utf8")).toBe("window A's change");
  });

  it("'none' means 'must not exist yet': refused if something is already there", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "already here");
    expect(store.write(PRIMARY_KEY, "mine", { expectRev: NONE })).toMatchObject({ ok: false, conflict: true, value: "already here" });
  });

  it("notices a file edited outside the app (it always re-reads before writing)", () => {
    const store = makeStore();
    const w = store.write(PRIMARY_KEY, "ours");
    fs.writeFileSync(storeFile(PRIMARY_KEY), "edited by hand");
    expect(store.write(PRIMARY_KEY, "ours v2", { expectRev: w.rev })).toMatchObject({ ok: false, conflict: true, value: "edited by hand" });
  });

  it("without expectRev it's a plain overwrite (used for non-critical keys)", () => {
    const store = makeStore();
    store.write("vault-finance-x", "a");
    expect(store.write("vault-finance-x", "b").ok).toBe(true);
    expect(store.get("vault-finance-x").value).toBe("b");
  });
});

describe("atomic writes: a failure never damages the existing data", () => {
  const seeded = (faults) => {
    makeStore().write(PRIMARY_KEY, "ORIGINAL DATA");
    return makeStore({ fs: faultyFs(faults) });
  };
  const expectIntact = () => {
    expect(fs.readFileSync(storeFile(PRIMARY_KEY), "utf8")).toBe("ORIGINAL DATA");
    expect(tmpFiles()).toEqual([]); // and no half-written temp file is left behind
  };

  it("disk full while writing the new content", () => {
    const store = seeded({ writeSync: (n, args) => (args[0] !== undefined && n >= 1 ? { code: "ENOSPC", message: "no space left on device" } : null) });
    const res = store.write(PRIMARY_KEY, "NEW DATA THAT DOES NOT FIT");
    expect(res).toMatchObject({ ok: false, error: { code: "ENOSPC" } });
    expectIntact();
  });

  it("failure while flushing to disk", () => {
    // Every flush fails (the session's launch-backup attempt also fails, which must not matter on its own).
    const store = seeded({ fsyncSync: () => ({ code: "EIO" }) });
    expect(store.write(PRIMARY_KEY, "NEW")).toMatchObject({ ok: false, error: { code: "EIO" } });
    expectIntact();
  });

  it("rename denied (e.g. read-only folder)", () => {
    const store = seeded({ renameSync: () => ({ code: "EROFS", message: "read-only file system" }) });
    expect(store.write(PRIMARY_KEY, "NEW")).toMatchObject({ ok: false, error: { code: "EROFS" } });
    expectIntact();
  });

  it("a partial write followed by failure leaves the original intact", () => {
    // writes half the bytes, then the disk 'fills'
    let first = true;
    const wrapped = { ...fs, writeSync: (fd, buf, off, len) => {
      if (first) { first = false; return fs.writeSync(fd, buf, off, Math.floor(len / 2)); }
      throw Object.assign(new Error("full"), { code: "ENOSPC" });
    } };
    makeStore().write(PRIMARY_KEY, "ORIGINAL DATA");
    const store = makeStore({ fs: wrapped });
    expect(store.write(PRIMARY_KEY, "A NEW VALUE THAT IS LONGER").ok).toBe(false);
    expectIntact();
  });

  it("a temporarily locked file (EPERM) is retried and the write succeeds", () => {
    const store = seeded({ renameSync: (n) => (n <= 2 ? { code: "EPERM" } : null) });
    expect(store.write(PRIMARY_KEY, "NEW").ok).toBe(true);
    expect(fs.readFileSync(storeFile(PRIMARY_KEY), "utf8")).toBe("NEW");
  });

  it("a stale temp file from a crashed write is cleaned up when the store starts", () => {
    makeStore();
    fs.writeFileSync(path.join(dir, "store", `${PRIMARY_KEY}.json.123.456.tmp`), "{half");
    expect(tmpFiles()).toHaveLength(1);
    makeStore();
    expect(tmpFiles()).toEqual([]);
  });

  it("a failed read (not 'missing') is reported, not treated as empty", () => {
    makeStore().write(PRIMARY_KEY, "data");
    const store = makeStore({ fs: faultyFs({ readFileSync: () => ({ code: "EIO", message: "i/o error" }) }) });
    expect(store.get(PRIMARY_KEY)).toMatchObject({ ok: false, error: { code: "EIO" } });
  });
});

describe("automatic backups", () => {
  it("nothing to back up on the very first write", () => {
    const store = makeStore();
    expect(store.write(PRIMARY_KEY, "v1").backup).toBeNull();
    expect(backupFiles()).toEqual([]);
  });

  it("the first change of a session backs up what was there before ('launch')", () => {
    makeStore().write(PRIMARY_KEY, "yesterday's data");
    clock += 1000;
    const nextSession = makeStore();
    const res = nextSession.write(PRIMARY_KEY, "today's data");
    expect(res.backup).toMatch(/-launch\.json$/);
    expect(fs.readFileSync(path.join(dir, "backups", res.backup), "utf8")).toBe("yesterday's data");
  });

  it("then at most one routine backup per 30 minutes", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "v0");
    store.write(PRIMARY_KEY, "v1"); // launch backup of v0
    for (let i = 2; i < 8; i++) { clock += 60 * 1000; store.write(PRIMARY_KEY, `v${i}`); } // 6 more minutes of edits
    expect(backupFiles()).toHaveLength(1);
    clock += AUTO_BACKUP_INTERVAL_MS;
    const res = store.write(PRIMARY_KEY, "v-later");
    expect(res.backup).toMatch(/-auto\.json$/);
    expect(backupFiles()).toHaveLength(2);
  });

  it("a requested 'before-...' backup is always taken, even right after another", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "v0");
    store.write(PRIMARY_KEY, "v1"); // launch backup (v0)
    const res = store.write(PRIMARY_KEY, "imported", { backupReason: "before-import" });
    expect(res.backup).toMatch(/-before-import\.json$/);
    expect(fs.readFileSync(path.join(dir, "backups", res.backup), "utf8")).toBe("v1");
  });

  it("ignores a made-up backup reason", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "v0");
    store.write(PRIMARY_KEY, "v1");
    clock += 1;
    expect(store.write(PRIMARY_KEY, "v2", { backupReason: "../../etc/passwd" }).backup).toBeNull();
  });

  it("does not make a second backup of content that was just backed up", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "A");
    store.write(PRIMARY_KEY, "B"); // launch backup of A
    store.write(PRIMARY_KEY, "A"); // within the interval: no backup (current B is not due)
    expect(backupFiles()).toHaveLength(1);
    clock += AUTO_BACKUP_INTERVAL_MS;
    // A backup is due now, but the file holds "A" - exactly what the last backup already contains.
    expect(store.write(PRIMARY_KEY, "C").backup).toBeNull();
    expect(backupFiles()).toHaveLength(1);
    clock += AUTO_BACKUP_INTERVAL_MS;
    // Now the file holds "C", which has never been backed up, so it is.
    expect(store.write(PRIMARY_KEY, "D").backup).toMatch(/-auto\.json$/);
    expect(backupFiles()).toHaveLength(2);
  });

  it("only the main data key is backed up", () => {
    const store = makeStore();
    store.write("vault-finance-other", "a");
    store.write("vault-finance-other", "b");
    expect(backupFiles()).toEqual([]);
  });

  it("keeps a bounded number: newest 10 routine, newest 5 'before-...'", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "v0");
    for (let i = 1; i <= 25; i++) { clock += AUTO_BACKUP_INTERVAL_MS; store.write(PRIMARY_KEY, `routine-${i}`); }
    for (let i = 1; i <= 9; i++) { clock += 1000; store.write(PRIMARY_KEY, `special-${i}`, { backupReason: "before-import" }); }
    const names = backupFiles();
    expect(names.filter((n) => !/before-/.test(n))).toHaveLength(KEEP_ROUTINE_BACKUPS);
    expect(names.filter((n) => /before-/.test(n))).toHaveLength(KEEP_BEFORE_BACKUPS);
  });

  it("a failing backup doesn't block saving, and is reported", () => {
    makeStore().write(PRIMARY_KEY, "v0");
    const blockBackups = faultyFs({ writeSync: (n, args) => null });
    const store = makeStore({ fs: { ...blockBackups, mkdirSync: fs.mkdirSync, existsSync: () => { throw new Error("backup folder unavailable"); } } });
    const res = store.write(PRIMARY_KEY, "v1");
    expect(res.ok).toBe(true);
    expect(res.backupError).toBeTruthy();
    expect(fs.readFileSync(storeFile(PRIMARY_KEY), "utf8")).toBe("v1");
  });

  it("deleting the main data key backs it up first", () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "precious");
    expect(store.delete(PRIMARY_KEY)).toMatchObject({ ok: true, removed: true });
    expect(fs.existsSync(storeFile(PRIMARY_KEY))).toBe(false);
    const [name] = backupFiles();
    expect(name).toMatch(/-before-delete\.json$/);
    expect(fs.readFileSync(path.join(dir, "backups", name), "utf8")).toBe("precious");
  });

  it("deleting a missing key is fine", () => {
    expect(makeStore().delete("vault-finance-nothing")).toEqual({ ok: true, removed: false });
  });
});

describe("listing and reading backups", () => {
  const seed = () => {
    const store = makeStore();
    store.write(PRIMARY_KEY, "v0");
    store.write(PRIMARY_KEY, "v1");
    clock += 1000;
    store.write(PRIMARY_KEY, "v2", { backupReason: "before-restore" });
    return store;
  };

  it("lists newest first with a reason, size and time", () => {
    const { backups } = seed().listBackups();
    expect(backups.map((b) => b.reason)).toEqual(["before-restore", "launch"]);
    expect(backups[0]).toMatchObject({ size: 2, modifiedMs: expect.any(Number) });
  });

  it("reads a backup's content", () => {
    const store = seed();
    const [{ name }] = store.listBackups().backups;
    expect(store.readBackup(name)).toEqual({ ok: true, value: "v1" });
  });

  it.each([["../store/vault-finance-data-v1.json"], ["a/b.json"], [".hidden.json"], ["no-extension"], [""], [null]])("refuses to read %j", (name) => {
    expect(seed().readBackup(name)).toMatchObject({ ok: false });
  });

  it("a backup that no longer exists is a clean error", () => {
    expect(seed().readBackup("20200101-000000-launch.json")).toMatchObject({ ok: false, error: { code: "ENOENT" } });
  });
});

describe("list", () => {
  it("lists keys by prefix, sorted, ignoring temp files", () => {
    const store = makeStore();
    store.write("vault-finance-b", "1");
    store.write("vault-finance-a", "1");
    store.write("other-key", "1");
    fs.writeFileSync(path.join(dir, "store", "vault-finance-z.json.1.2.tmp"), "x");
    expect(store.list("vault-finance-")).toEqual({ ok: true, keys: ["vault-finance-a", "vault-finance-b"] });
    expect(store.list("").keys).toEqual(["other-key", "vault-finance-a", "vault-finance-b"]);
  });
});
