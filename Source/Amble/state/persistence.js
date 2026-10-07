import { NO_REVISION } from "../storage";
import { mergeStates } from "./merge";
import { validateState } from "./validate";

// Keeps the app's in-memory data and the stored copy in step, safely. It replaces the old "save the
// whole state on every change and hope" effect, which had four problems:
//   - a failed write was swallowed, so the app carried on as if saved (finding #3)
//   - two windows saving at once silently overwrote each other (finding #4)
//   - every window re-saved what it had just received from another window (echo writes)
//   - nothing waited for in-flight saves, so rapid changes could land out of order
//
// How it works. It remembers the version it believes is stored (`lastJson`, with its revision `lastRev`)
// and the parsed data that version corresponds to (`base`). Each save is a compare-and-set:
// "write this, but only if the stored version is still `lastRev`".
//   - If it is: done; the new version becomes the baseline.
//   - If another window saved first: the store refuses and returns its version. We three-way merge
//     (base = what we both started from, local = our data, remote = theirs), apply the result to the
//     app, and save the merged data. Neither window's changes are lost.
//   - If the write fails (disk full, permissions...): the status becomes an error the app shows, saving is
//     retried with a growing delay, and the data stays safely in memory in the meantime.
// Only one save is ever in flight; changes that arrive meanwhile are coalesced into the next one.

const noop = () => {};

// Plain-English reason for a failed save, for the banner.
export function describeSaveError(error) {
  const code = error && error.code;
  if (code === "ENOSPC" || code === "EDQUOT" || code === "QuotaExceededError") return "the disk (or Amble's storage space) is full";
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return "Amble isn't allowed to write to its data folder";
  if (code === "ECONFLICT") return "another Amble window keeps changing the data";
  if (code === "ESTOREUNAVAILABLE") return (error && error.message) || "Amble's data folder couldn't be opened";
  if (code === "EUNREADABLE") return "the saved data was changed outside Amble and can't be read, so Amble won't overwrite it";
  return (error && error.message) || "an unknown problem";
}

export function createPersistence({
  storage,
  key,
  onStatus = noop, // ({ state: "idle" | "saving" | "saved" | "error", error?, at?, backupError? })
  onRemoteState = noop, // (newState, { merged }) - the app must adopt this state
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  retryDelaysMs = [3000, 10000, 30000],
  maxMergeAttempts = 5,
}) {
  let latest = null; // the app's current data (what should be stored)
  let base = null; // parsed data matching the stored version we know about
  let lastJson = null; // text we believe matches the stored version (null = nothing stored)
  let lastRev = NO_REVISION;
  let inFlight = null; // promise of the running save loop
  let dirty = false;
  let retryTimer = null;
  let retryCount = 0;
  let pendingBackupReason = null;
  let stopped = false;
  let status = { state: "idle" };

  const setStatus = (next) => {
    status = next;
    onStatus(next);
  };

  const clearRetry = () => { if (retryTimer !== null) { clearTimer(retryTimer); retryTimer = null; } };

  function scheduleRetry() {
    clearRetry();
    const delay = retryDelaysMs[Math.min(retryCount, retryDelaysMs.length - 1)];
    retryCount++;
    retryTimer = setTimer(() => { retryTimer = null; flush(); }, delay);
  }

  function fail(error) {
    setStatus({ state: "error", error, message: describeSaveError(error) });
    scheduleRetry();
  }

  // Adopts the stored version `res.value` and merges it with our data. Returns false if it can't be read.
  function resolveConflict(res) {
    if (res.value === null || res.value === undefined) {
      // The stored copy disappeared (deleted elsewhere). Ours is the only copy: write it back.
      lastJson = null;
      lastRev = res.rev === undefined ? NO_REVISION : res.rev;
      return true;
    }
    let remote;
    try {
      const checked = validateState(JSON.parse(res.value));
      remote = checked.ok ? checked.state : null;
    } catch (e) { remote = null; }
    if (!remote) return false; // never overwrite something we can't read
    const merged = mergeStates(base, latest, remote);
    latest = merged;
    base = remote;
    lastJson = JSON.stringify(remote);
    lastRev = res.rev;
    onRemoteState(merged, { merged: true });
    return true;
  }

  async function run() {
    let conflicts = 0;
    do {
      dirty = false;
      const snapshot = latest;
      const json = JSON.stringify(snapshot);
      if (json === lastJson) {
        if (status.state !== "saved") setStatus({ state: "saved", at: Date.now() });
        break;
      }
      setStatus({ state: "saving" });
      const opts = { expectRev: lastRev };
      if (pendingBackupReason) opts.backupReason = pendingBackupReason;
      const res = await storage.write(key, json, opts);
      if (stopped) return;

      if (res.ok) {
        lastJson = json;
        lastRev = res.rev;
        base = snapshot;
        pendingBackupReason = null;
        retryCount = 0;
        clearRetry();
        setStatus({ state: "saved", at: Date.now(), ...(res.backupError ? { backupError: res.backupError } : {}) });
      } else if (res.conflict) {
        if (++conflicts > maxMergeAttempts) { fail({ code: "ECONFLICT", message: "The data kept changing in another window." }); break; }
        if (!resolveConflict(res)) { fail({ code: "EUNREADABLE", message: "The stored data could not be read." }); break; }
        dirty = true; // save the merged result
      } else {
        fail(res.error || { code: "ERROR", message: "The save failed." });
        break;
      }
    } while (dirty);
  }

  function flush() {
    if (stopped || latest === null) return Promise.resolve();
    if (inFlight) { dirty = true; return inFlight; }
    inFlight = run().finally(() => {
      inFlight = null;
      // A change that arrived in the instant between the loop's last check and here would otherwise
      // be marked dirty and never saved.
      if (dirty && !stopped) flush();
    });
    return inFlight;
  }

  let receiveChain = Promise.resolve();

  async function handleChange({ key: changedKey, rev }) {
    if (stopped || changedKey !== key || latest === null) return;
    if (rev !== undefined && rev === lastRev) return; // we already have exactly that version
    let current;
    try { current = await storage.get(key); } catch (e) { return; }
    if (stopped) return;
    if (current === null || current === undefined) { // deleted elsewhere: put our copy back
      lastJson = null;
      lastRev = NO_REVISION;
      flush();
      return;
    }
    if (current.rev !== undefined && current.rev === lastRev) return;
    applyRemote(current.value, current.rev);
  }

  function applyRemote(value, rev) {
    let remote;
    try {
      const checked = validateState(JSON.parse(value));
      if (!checked.ok) return;
      remote = checked.state;
    } catch (e) { return; }
    const remoteJson = JSON.stringify(remote);
    if (remoteJson === lastJson) { lastRev = rev; return; } // nothing new to us
    const unsavedLocalChanges = inFlight !== null || JSON.stringify(latest) !== lastJson;
    if (!unsavedLocalChanges) {
      latest = remote;
      base = remote;
      lastJson = remoteJson;
      lastRev = rev;
      onRemoteState(remote, { merged: false });
    } else {
      const merged = mergeStates(base, latest, remote);
      latest = merged;
      base = remote;
      lastJson = remoteJson;
      lastRev = rev;
      onRemoteState(merged, { merged: true });
      flush();
    }
  }

  return {
    // Call once after loading. `rawText`/`rev` describe what is stored now (rawText "" / rev "none" for a fresh install).
    // If the loaded data was repaired, its text differs from rawText, so the first update() saves the repaired version.
    init({ state, rawText = null, rev = NO_REVISION }) {
      latest = state;
      base = state;
      lastJson = typeof rawText === "string" && rawText !== "" ? rawText : null;
      lastRev = rev;
    },

    // Call whenever the app's data changes.
    update(state) {
      latest = state;
      return flush();
    },

    // Another window changed the stored value. The notification is only a SIGNAL that something changed: its
    // payload may already be out of date (this window may have merged that change itself in the meantime), so
    // acting on it could roll newer data back. Instead the current stored value is read and judged against
    // what this window knows. Notifications are handled one at a time, in order.
    receive(change) {
      receiveChain = receiveChain.then(() => handleChange(change)).catch(() => {});
      return receiveChain;
    },

    // Save right now, synchronously. For use only while the window is closing, when an async save might not finish.
    flushSync() {
      if (stopped || latest === null || typeof storage.writeSync !== "function") return false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const json = JSON.stringify(latest);
        if (json === lastJson) return true;
        const opts = { expectRev: lastRev };
        if (pendingBackupReason) opts.backupReason = pendingBackupReason;
        const res = storage.writeSync(key, json, opts);
        if (res.ok) {
          lastJson = json;
          lastRev = res.rev;
          base = latest;
          pendingBackupReason = null;
          return true;
        }
        if (!res.conflict || !resolveConflict(res)) return false;
      }
      return false;
    },

    // The next save also asks the store to keep a backup of what it's replacing ("before-import", "before-restore").
    requestBackup(reason) { pendingBackupReason = reason; },

    // Try again now (the banner's "Retry" button).
    retry() { retryCount = 0; clearRetry(); return flush(); },

    getStatus: () => status,

    stop() { stopped = true; clearRetry(); },
  };
}
