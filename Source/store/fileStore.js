// The durable store for Amble's data, used by the Electron main process.
//
// Why this exists: the data used to live in the renderer's localStorage. That has no failure
// reporting (a failed write just returned null), writes are flushed lazily so a crash or power loss
// can drop the last few seconds, and there are no backups. This store keeps each key as a plain JSON
// file in the app's data folder and gives it the properties a person's finances need:
//
//   - ATOMIC writes: the new content goes to a temp file, is fsync'd, then renamed over the old file.
//     A crash or full disk at any point leaves either the complete old file or the complete new one,
//     never a half-written file.
//   - REAL errors: every operation returns { ok: false, error } instead of failing silently.
//   - COMPARE-AND-SET revisions: every value has a revision (a hash of its content). A writer can say
//     "only write if the file is still the version I last saw"; if another window got there first the
//     write is refused and the current value is handed back so the writer can merge. This is what makes
//     several windows safe to use at once.
//   - ROTATING BACKUPS of the main data file: one on the first change each session, one at most every
//     30 minutes after that, and one before anything destructive (import, restore, delete).
//
// No Electron imports here, and the filesystem is injectable, so all of this is unit-tested against
// real temp folders and simulated disk failures.

const nodeFs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Must match STORAGE_KEY in Amble/constants.js (a test checks they agree).
const PRIMARY_KEY = "vault-finance-data-v1";

// Keys become file names, so they're restricted to a safe character set (no slashes, no leading dot).
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const BACKUP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/;
const BACKUP_REASON_PATTERN = /^before-[a-z]+(-[a-z]+)*$/;

const MAX_VALUE_BYTES = 64 * 1024 * 1024;
const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
const KEEP_ROUTINE_BACKUPS = 10; // "launch" and "auto"
const KEEP_BEFORE_BACKUPS = 5; // "before-import", "before-restore", "before-delete"

// The revision of a key that has no file yet.
const NONE = "none";

const sha1 = (text) => crypto.createHash("sha1").update(text, "utf8").digest("hex");

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function failure(error) {
  return { ok: false, error: { code: (error && (error.code || error.name)) || "ERROR", message: (error && error.message) || String(error) } };
}

function createFileStore({ dir, fs = nodeFs, now = Date.now, log = () => {} }) {
  const storeDir = path.join(dir, "store");
  const backupDir = path.join(dir, "backups");
  let sessionBackedUp = false;
  let lastRoutineBackupAt = 0;
  let lastBackupRev = null;

  fs.mkdirSync(storeDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  // A crash mid-write can leave a temp file behind. It's by definition incomplete; remove it.
  try {
    for (const name of fs.readdirSync(storeDir)) {
      if (name.endsWith(".tmp")) { try { fs.unlinkSync(path.join(storeDir, name)); } catch (e) { /* best effort */ } }
    }
  } catch (e) { log("could not clean temp files", e); }

  const fileFor = (key) => {
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw Object.assign(new Error(`Invalid key: ${String(key).slice(0, 60)}`), { code: "EINVALIDKEY" });
    return path.join(storeDir, `${key}.json`);
  };

  function readText(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  function renameWithRetry(from, to) {
    // On Windows an antivirus scanner or search indexer can briefly hold the file; retry a few times.
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(from, to); return; } catch (e) {
        if (attempt < 4 && (e.code === "EPERM" || e.code === "EBUSY" || e.code === "EACCES")) sleepSync(20 * (attempt + 1));
        else throw e;
      }
    }
  }

  function atomicWrite(file, text) {
    const tmp = `${file}.${process.pid}.${now()}.tmp`;
    let fd;
    try {
      fd = fs.openSync(tmp, "w");
      const buf = Buffer.from(text, "utf8");
      let offset = 0;
      while (offset < buf.length) offset += fs.writeSync(fd, buf, offset, buf.length - offset);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      renameWithRetry(tmp, file);
    } catch (e) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch (e2) { /* already failing */ } }
      try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean */ }
      throw e;
    }
    try { // make the rename itself durable (not possible on Windows; harmless there)
      const dfd = fs.openSync(path.dirname(file), "r");
      try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
    } catch (e) { /* best effort */ }
  }

  /* ---------------------------------- backups ---------------------------------- */

  const stamp = () => new Date(now()).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");

  function makeBackup(text, reason) {
    let name = `${stamp()}-${reason}.json`;
    for (let n = 2; fs.existsSync(path.join(backupDir, name)); n++) name = `${stamp()}-${reason}-${n}.json`;
    atomicWrite(path.join(backupDir, name), text);
    lastBackupRev = sha1(text);
    pruneBackups();
    return name;
  }

  const reasonOf = (name) => {
    const m = /^\d{8}-\d{6}-(.+?)(?:-\d+)?\.json$/.exec(name);
    return m ? m[1] : "unknown";
  };

  function listBackupNames() {
    try {
      return fs.readdirSync(backupDir).filter((n) => /^\d{8}-\d{6}-.+\.json$/.test(n)).sort().reverse(); // newest first
    } catch (e) { return []; }
  }

  function pruneBackups() {
    try {
      const names = listBackupNames();
      const routine = names.filter((n) => !reasonOf(n).startsWith("before-"));
      const before = names.filter((n) => reasonOf(n).startsWith("before-"));
      for (const n of [...routine.slice(KEEP_ROUTINE_BACKUPS), ...before.slice(KEEP_BEFORE_BACKUPS)]) {
        try { fs.unlinkSync(path.join(backupDir, n)); } catch (e) { /* best effort */ }
      }
    } catch (e) { log("could not prune backups", e); }
  }

  // Decides whether the content about to be replaced should be backed up first, and does it. A backup
  // problem is reported but never blocks the write itself.
  function backupBeforeOverwrite(current, requestedReason) {
    if (current === null) return { backup: null };
    const rev = sha1(current);
    if (rev === lastBackupRev) return { backup: null }; // identical to the backup we just made
    let reason = requestedReason && BACKUP_REASON_PATTERN.test(requestedReason) ? requestedReason : null;
    if (!reason && !sessionBackedUp) reason = "launch";
    if (!reason && now() - lastRoutineBackupAt >= AUTO_BACKUP_INTERVAL_MS) reason = "auto";
    if (!reason) return { backup: null };
    try {
      const name = makeBackup(current, reason);
      if (!reason.startsWith("before-")) { sessionBackedUp = true; lastRoutineBackupAt = now(); }
      return { backup: name };
    } catch (e) {
      log("backup failed", e);
      return { backup: null, backupError: failure(e).error };
    }
  }

  /* ---------------------------------- the key/value operations ---------------------------------- */

  function get(key) {
    try {
      const text = readText(fileFor(key));
      return text === null ? { ok: true, found: false, rev: NONE } : { ok: true, found: true, value: text, rev: sha1(text) };
    } catch (e) { return failure(e); }
  }

  // opts.expectRev: only write if the file is still at this revision (use "none" for "must not exist yet").
  //                 If it isn't, nothing is written and { ok: false, conflict: true, rev, value } is returned.
  // opts.backupReason: "before-..." forces a backup of the current content first (main data key only).
  function write(key, value, opts = {}) {
    try {
      if (typeof value !== "string") throw Object.assign(new Error("Value must be a string"), { code: "EINVALIDVALUE" });
      if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) throw Object.assign(new Error("Value is too large"), { code: "EFBIG" });
      const file = fileFor(key);
      const current = readText(file); // read fresh every time: also catches edits made outside the app
      const currentRev = current === null ? NONE : sha1(current);
      if (opts.expectRev !== undefined && opts.expectRev !== currentRev) {
        return { ok: false, conflict: true, rev: currentRev, value: current };
      }
      if (current === value) return { ok: true, rev: currentRev, unchanged: true };
      const result = key === PRIMARY_KEY ? backupBeforeOverwrite(current, opts.backupReason) : { backup: null };
      atomicWrite(file, value);
      return { ok: true, rev: sha1(value), ...result };
    } catch (e) { return failure(e); }
  }

  function remove(key) {
    try {
      const file = fileFor(key);
      const current = readText(file);
      if (current === null) return { ok: true, removed: false };
      if (key === PRIMARY_KEY) { const b = backupBeforeOverwrite(current, "before-delete"); if (b.backupError) return { ok: false, error: b.backupError }; }
      fs.unlinkSync(file);
      return { ok: true, removed: true };
    } catch (e) { return failure(e); }
  }

  function list(prefix = "") {
    try {
      const keys = fs.readdirSync(storeDir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter((k) => k.startsWith(prefix)).sort();
      return { ok: true, keys };
    } catch (e) { return failure(e); }
  }

  function listBackups() {
    try {
      const backups = listBackupNames().map((name) => {
        const st = fs.statSync(path.join(backupDir, name));
        return { name, reason: reasonOf(name), size: st.size, modifiedMs: st.mtimeMs };
      });
      return { ok: true, backups };
    } catch (e) { return failure(e); }
  }

  function readBackup(name) {
    try {
      if (typeof name !== "string" || !BACKUP_NAME_PATTERN.test(name)) throw Object.assign(new Error("Invalid backup name"), { code: "EINVALIDNAME" });
      const text = readText(path.join(backupDir, name));
      if (text === null) throw Object.assign(new Error("That backup no longer exists"), { code: "ENOENT" });
      return { ok: true, value: text };
    } catch (e) { return failure(e); }
  }

  const info = () => ({ ok: true, dir, storeDir, backupDir, primaryKey: PRIMARY_KEY });

  return { get, write, delete: remove, list, listBackups, readBackup, info };
}

module.exports = { createFileStore, PRIMARY_KEY, NONE, KEY_PATTERN, AUTO_BACKUP_INTERVAL_MS, KEEP_ROUTINE_BACKUPS, KEEP_BEFORE_BACKUPS, MAX_VALUE_BYTES };
