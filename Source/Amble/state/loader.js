import { STORAGE_KEY } from "../constants";
import { defaultState } from "./budgets";
import { appendQuarantine } from "./quarantine";
import { preserveRawCopy } from "./recovery";
import { validateState } from "./validate";

// Reads the saved data and decides what the app should do with it. Kept out of App so the
// important rule is testable: if the saved data can't be read, say so - never quietly start from
// an empty state, because the app auto-saves and that would overwrite whatever was there.
//
// Returns one of:
//   { status: "empty",      state }                        nothing saved yet - a fresh install
//   { status: "ok",         state, report }                loaded cleanly
//   { status: "repaired",   state, report, ... }           loaded, with repairs and/or set-aside records
//   { status: "unreadable", error, rawText }               could not be read; nothing was touched
export async function loadStoredState(storage = typeof window !== "undefined" ? window.storage : undefined) {
  let res;
  try {
    res = await storage.get(STORAGE_KEY, false);
  } catch (error) {
    return { status: "unreadable", error, rawText: null };
  }
  if (!res || !res.value) return { status: "empty", state: defaultState() };

  let parsed;
  try {
    parsed = JSON.parse(res.value);
  } catch (error) {
    return { status: "unreadable", error, rawText: res.value };
  }

  const result = validateState(parsed);
  if (!result.ok) return { status: "unreadable", error: new Error(result.error), rawText: res.value };

  const { report } = result;
  if (!report.repairedCount && !report.quarantinedCount) return { status: "ok", state: result.state, report, rawText: res.value };

  // Repairs and set-aside records mean the saved data is about to be rewritten in its repaired form
  // (the app auto-saves). Keep the original exactly as it was first, so nothing can be lost.
  const copy = await preserveRawCopy(res.value, "before-repair", storage);
  const quarantine = await appendQuarantine(report.quarantined, "load", storage);
  return { status: "repaired", state: result.state, report, rawText: res.value, safetyCopyKept: copy.ok, quarantineSaved: quarantine.ok };
}
