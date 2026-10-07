import { NO_REVISION, isDataKey } from "../storage";

// One-time move of existing users' data from the browser's localStorage (where it lived before the
// file store) into the file store. It is deliberately cautious:
//   - it only runs on the file store, and only once (a marker records that it ran);
//   - it never overwrites anything already in the file store (the file store always wins);
//   - it never deletes or changes the old localStorage copy, which stays as an extra backup;
//   - every copied value is read back and compared before it counts as migrated;
//   - the marker is written only if EVERYTHING went smoothly, so a partial failure is retried next launch.
// The marker also matters for "Start fresh": once the data has been migrated, deleting it must not make
// the old localStorage copy come back to life on the next launch.

export const MIGRATION_MARKER_KEY = "vault-finance-migrated-v1";

const problem = (key, error) => ({ key, error: { code: (error && error.code) || "ERROR", message: (error && error.message) || String(error) } });

function browserLocalStorage() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
}

// Returns { ran, migrated: [keys], problems: [{ key, error }], error? }
export async function migrateLegacyStorage(storage, legacy = browserLocalStorage()) {
  if (!storage || storage.kind !== "file" || !legacy) return { ran: false, migrated: [], problems: [] };

  try {
    if (await storage.get(MIGRATION_MARKER_KEY)) return { ran: false, migrated: [], problems: [] };
  } catch (error) {
    return { ran: false, migrated: [], problems: [], error };
  }

  let keys;
  try { keys = Object.keys(legacy).filter(isDataKey).sort(); } catch (error) { return { ran: false, migrated: [], problems: [], error }; }

  const migrated = [];
  const problems = [];
  for (const key of keys) {
    let value;
    try { value = legacy.getItem(key); } catch (error) { problems.push(problem(key, error)); continue; }
    if (typeof value !== "string") continue;

    try { if (await storage.get(key)) continue; } catch (error) { problems.push(problem(key, error)); continue; } // already there: the file store wins

    const res = await storage.write(key, value, { expectRev: NO_REVISION });
    if (!res.ok && res.conflict) continue; // created by someone in the meantime: leave theirs
    if (!res.ok) { problems.push(problem(key, res.error)); continue; }

    let back = null;
    try { back = await storage.get(key); } catch (error) { back = null; }
    if (back && back.value === value) migrated.push(key);
    else problems.push(problem(key, { code: "EVERIFY", message: "The copied data did not match the original." }));
  }

  if (problems.length === 0) await storage.write(MIGRATION_MARKER_KEY, new Date().toISOString());
  return { ran: true, migrated, problems };
}
