// Three-way merge of two versions of the app's data that both grew from a common starting point.
//
// Why: Amble can have several windows open (the main window plus popped-out views), and each holds the
// whole dataset in memory. If two windows change the data at about the same time, the second one to
// save would simply overwrite the first one's change. With a compare-and-set store (see store/fileStore.js)
// the second save is refused instead, and that window calls this to combine:
//   base   - the data both windows last agreed on
//   local  - this window's data (has its own unsaved changes)
//   remote - what the other window saved meanwhile
// Nothing either window did is lost, unless both changed the very same value.
//
// Rules, per record (matched by id) and then field by field:
//   - changed on only one side              -> that side's change is kept
//   - different fields changed on each side -> both changes are kept
//   - the same field changed on both sides  -> THIS window's value wins (it's the one the person is using now)
//   - added on either side                  -> kept
//   - deleted on one side, edited on the other -> the record is KEPT with the edit (an edit is never silently
//                                                 thrown away by a deletion made elsewhere)
//   - deleted on one side, untouched on the other -> deleted
//   - lists inside a record (e.g. a budget's categories) changed on both sides -> this window's list wins
// A few invariants that a field-by-field merge could break are repaired afterwards (only one active budget,
// no "paid" marks pointing at transactions that no longer exist).

const COLLECTIONS = ["accounts", "categories", "transactions", "plans", "bills", "goals"];

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Deep equality for JSON values; object key order doesn't matter, array order does. `undefined` equals only `undefined`.
export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isPlain(a) && isPlain(b)) {
    const ak = Object.keys(a).filter((k) => a[k] !== undefined);
    const bk = Object.keys(b).filter((k) => b[k] !== undefined);
    return ak.length === bk.length && ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

// Merges one value. Returns undefined when the merged result is "absent".
export function merge3(base, local, remote) {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(base, local)) return remote; // only the other window changed it
  if (deepEqual(base, remote)) return local; // only this window changed it
  if (isPlain(local) && isPlain(remote)) {
    const b = isPlain(base) ? base : {};
    const out = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(b)])) {
      const merged = merge3(b[key], local[key], remote[key]);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  return local; // both changed the same value (or a list): this window wins
}

function mergeCollection(base, local, remote) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const byId = (items) => new Map(list(items).map((item) => [item.id, item]));
  const b = byId(base);
  const l = byId(local);
  const r = byId(remote);
  // The other window's order first, then anything only this window added.
  const ids = [...new Set([...list(remote).map((x) => x.id), ...list(local).map((x) => x.id)])];
  const out = [];
  for (const id of ids) {
    const bi = b.get(id), li = l.get(id), ri = r.get(id);
    let merged;
    if (bi === undefined) merged = li !== undefined && ri !== undefined ? merge3(undefined, li, ri) : (li !== undefined ? li : ri);
    else if (li === undefined) merged = deepEqual(bi, ri) ? undefined : ri; // deleted here: stays deleted unless edited there
    else if (ri === undefined) merged = deepEqual(bi, li) ? undefined : li; // deleted there: stays deleted unless edited here
    else merged = merge3(bi, li, ri);
    if (merged !== undefined) out.push(merged);
  }
  return out;
}

// Two windows can each activate a different budget; a field-by-field merge would leave both active.
function normalizeActiveBudget(plans, localPlans) {
  const active = plans.filter((p) => p.active);
  if (active.length <= 1) return plans;
  const localActive = new Set((localPlans || []).filter((p) => p.active).map((p) => p.id));
  const keep = (active.find((p) => localActive.has(p.id)) || active[0]).id;
  return plans.map((p) => (p.active && p.id !== keep ? { ...p, active: false } : p));
}

// A bill's "paid" mark can point at a transaction. If the other window deleted that transaction, drop the mark.
function dropDanglingCompletions(bills, transactions) {
  const txIds = new Set(transactions.map((t) => t.id));
  let changed = false;
  const cleaned = bills.map((bill) => {
    if (!isPlain(bill.completions)) return bill;
    const completions = {};
    for (const [date, mark] of Object.entries(bill.completions)) {
      if (typeof mark === "string" && !txIds.has(mark)) changed = true;
      else completions[date] = mark;
    }
    return Object.keys(completions).length === Object.keys(bill.completions).length ? bill : { ...bill, completions };
  });
  return changed ? cleaned : bills;
}

export function mergeStates(base, local, remote) {
  const b = isPlain(base) ? base : {};
  const out = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    if (COLLECTIONS.includes(key)) out[key] = mergeCollection(b[key], local[key], remote[key]);
    else {
      const merged = merge3(b[key], local[key], remote[key]);
      if (merged !== undefined) out[key] = merged;
    }
  }
  if (Array.isArray(out.plans)) out.plans = normalizeActiveBudget(out.plans, local.plans);
  if (Array.isArray(out.bills) && Array.isArray(out.transactions)) out.bills = dropDanglingCompletions(out.bills, out.transactions);
  return out;
}
