// Records the validator couldn't use are never thrown away: they're kept here, exportable, so
// nothing a person entered is ever lost just because it was damaged. Stored under its own key so
// it can never interfere with the main data, and capped so it can't grow without bound or crowd
// out the real data in storage.

export const QUARANTINE_KEY = "vault-finance-quarantine-v1";
const MAX_ITEMS = 1000;
const MAX_BYTES = 1_500_000;

const defaultStorage = () => (typeof window !== "undefined" ? window.storage : undefined);

export async function readQuarantine(storage = defaultStorage()) {
  try {
    const res = await storage.get(QUARANTINE_KEY, false);
    const parsed = res && res.value ? JSON.parse(res.value) : null;
    return parsed && Array.isArray(parsed.items) ? parsed.items : [];
  } catch (e) {
    return [];
  }
}

// Adds records to the set-aside store (oldest are dropped first if the caps are exceeded).
// Returns { ok, total } - ok is false if the store couldn't be written (e.g. storage is full),
// in which case the caller should still hold the items in memory so they can be exported now.
export async function appendQuarantine(items, source, storage = defaultStorage()) {
  if (!items || items.length === 0) return { ok: true, total: (await readQuarantine(storage)).length };
  const at = new Date().toISOString();
  const existing = await readQuarantine(storage);
  let all = [...existing, ...items.map((it) => ({ at, source, collection: it.collection, reason: it.reason, record: it.record }))];
  if (all.length > MAX_ITEMS) all = all.slice(all.length - MAX_ITEMS);
  let json = JSON.stringify({ items: all });
  while (json.length > MAX_BYTES && all.length > 1) {
    all = all.slice(Math.ceil(all.length / 10));
    json = JSON.stringify({ items: all });
  }
  try {
    const res = await storage.set(QUARANTINE_KEY, json, false);
    return { ok: !!res, total: all.length };
  } catch (e) {
    return { ok: false, total: all.length };
  }
}

export async function clearQuarantine(storage = defaultStorage()) {
  try { await storage.delete(QUARANTINE_KEY, false); return true; } catch (e) { return false; }
}

// The file a person gets when exporting set-aside records: readable JSON they (or support) can inspect.
export function quarantineExportText(items) {
  return JSON.stringify({ app: "amble-finance", kind: "set-aside-records", exportedAt: new Date().toISOString(), items }, null, 2);
}
