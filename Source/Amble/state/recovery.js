import { STORAGE_KEY } from "../constants";
import { appendQuarantine } from "./quarantine";
import { parseBackupText } from "./validate";

// Helpers for getting a person out of trouble when saved data is unreadable or the app crashes.
// They talk to storage directly (not through React state), so they work even when the app
// itself can't render.

const defaultStorage = () => (typeof window !== "undefined" ? window.storage : undefined);
const SAFETY_COPY_PREFIX = `${STORAGE_KEY}-saved-`;
const MAX_SAFETY_COPIES = 3;

export async function readRawData(storage = defaultStorage()) {
  try {
    const res = await storage.get(STORAGE_KEY, false);
    return res && typeof res.value === "string" ? res.value : null;
  } catch (e) {
    return null;
  }
}

async function safetyCopyKeys(storage) {
  try {
    const res = await storage.list(SAFETY_COPY_PREFIX, false);
    // keys end in a millisecond timestamp, so a numeric sort puts the oldest first
    return (res && res.keys ? res.keys : []).slice().sort((a, b) => Number(a.slice(a.lastIndexOf("-") + 1)) - Number(b.slice(b.lastIndexOf("-") + 1)));
  } catch (e) {
    return [];
  }
}

// Keeps a verbatim copy of text (usually the current saved data) under a separate key, before
// anything that could change or replace it. Only the newest few copies are kept. Returns
// { ok, key } - ok is false if it couldn't be written (storage full), in which case the caller
// should not proceed with anything destructive without an export.
export async function preserveRawCopy(rawText, tag, storage = defaultStorage()) {
  if (typeof rawText !== "string") return { ok: true, key: null }; // nothing there to preserve
  const key = `${SAFETY_COPY_PREFIX}${tag}-${Date.now()}`;
  let res = null;
  try { res = await storage.set(key, rawText, false); } catch (e) { res = null; }
  if (!res) {
    // Possibly full: make room by dropping the oldest copy, then try once more.
    const keys = await safetyCopyKeys(storage);
    if (keys.length) {
      await storage.delete(keys[0], false);
      try { res = await storage.set(key, rawText, false); } catch (e) { res = null; }
    }
  }
  if (!res) return { ok: false, key: null };
  const keys = await safetyCopyKeys(storage);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SAFETY_COPIES))) await storage.delete(old, false);
  return { ok: true, key };
}

// "Start fresh": clears the saved data, but only after a safety copy of it exists.
export async function startFresh(storage = defaultStorage()) {
  const raw = await readRawData(storage);
  const copy = await preserveRawCopy(raw, "before-reset", storage);
  if (!copy.ok) return { ok: false, error: "Amble couldn't keep a safety copy of your data (storage may be full), so nothing was cleared. Export your data first, then try again." };
  await storage.delete(STORAGE_KEY, false);
  return { ok: true, preservedKey: copy.key };
}

// Replaces the saved data with a validated backup file. If the file isn't a usable backup, nothing
// at all is changed. The previous data is kept as a safety copy first.
export async function restoreFromBackupText(text, storage = defaultStorage()) {
  const parsed = parseBackupText(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const copy = await preserveRawCopy(await readRawData(storage), "before-restore", storage);
  if (!copy.ok) return { ok: false, error: "Amble couldn't keep a safety copy of the current data (storage may be full), so nothing was replaced. Export your data first, then try again." };
  const written = await storage.set(STORAGE_KEY, JSON.stringify(parsed.state), false);
  if (!written) return { ok: false, error: "The backup was valid but couldn't be saved (storage may be full). Nothing was replaced." };
  await appendQuarantine(parsed.report.quarantined, "restore", storage);
  return { ok: true, report: parsed.report };
}

// Saves text to a file via a download. (Used for exporting raw data and set-aside records.)
export function downloadTextFile(filename, text, doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return false;
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking immediately can cancel the download
  return true;
}

// Downloads the saved data exactly as stored (even if it's damaged and can't be parsed), so a
// person can always walk away with their data. Returns { ok } or { ok: false, empty: true }.
export async function exportRawData(filename, storage = defaultStorage()) {
  const raw = await readRawData(storage);
  if (raw === null) return { ok: false, empty: true };
  return { ok: downloadTextFile(filename, raw) };
}
