// state/planning.js
//
import { addMonthsClamped, toLocalDateStr } from "../utils/dates";
import { moneyAtLeast, roundMoney, toCents } from "../utils/money";

// Data model added by the "Plan" tab:
//
// Bill (a scheduled/recurring transaction template):
//   {
//     id, name, amount, type: "expense" | "income",
//     accountId, categoryId,               // both nullable, mirrors TransactionModal
//     dueDate,                             // "YYYY-MM-DD" - first/only occurrence
//     recurring: boolean,
//     frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannually" | "yearly",
//     endDate,                             // "YYYY-MM-DD" or null - stop generating after this date
//     notes,
//     seriesId,                            // optional; shared by every segment of one recurring bill (falls back to id)
//     anchorDay,                           // optional; see generateBillOccurrences
//     completions: { [dateKey]: transactionId | true },
//       // keyed by the occurrence's date. `true` means "marked paid manually",
//       // a transaction id means that occurrence is linked to a real transaction.
//   }
//
// Goal (a savings target):
//   {
//     id, name, targetAmount, targetDate,  // "YYYY-MM-DD" or null
//     trackingMode: "account" | "manual",
//     accountId,                           // used when trackingMode === "account"
//     manualAmount,                        // used when trackingMode === "manual"
//     notes,
//     dateCreated,
//   }

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannually", label: "Semi-annually" },
  { value: "yearly", label: "Yearly" },
];
export const FREQUENCY_LABELS = Object.fromEntries(FREQUENCY_OPTIONS.map((f) => [f.value, f.label]));

export function defaultPlanState() {
  return { bills: [], goals: [] };
}

/* ---------------------------------- date helpers ---------------------------------- */
// All dates in this module are plain "YYYY-MM-DD" strings, same convention as
// transaction dates elsewhere in the app, so they sort and compare correctly
// with plain string comparison without ever needing a timezone-aware Date.
// toKey defers to toLocalDateStr (utils/dates.js) rather than reimplementing
// it, so this stays on the same local-calendar-day convention as the rest of
// the app (see that file's note on why toISOString() is avoided).

function toDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const toKey = toLocalDateStr;

// Steps a date forward by one cycle of `frequency`. Monthly/quarterly/semi-annual/yearly delegate to
// addMonthsClamped (utils/dates.js) - the same clamping budgets.js already
// relies on for its own repeat logic - so a bill due the 31st doesn't silently
// drift into early next month when it lands on a shorter one (Feb, Apr, etc.):
// it clamps to that month's last day instead, then returns to the 31st as soon
// as a 31-day month comes around again. `anchorDay` should stay fixed at the
// bill's original due-date day-of-month across every step (see
// generateBillOccurrences) rather than being re-derived from a
// possibly-already-clamped cursor, which is what keeps that self-correcting
// behavior going indefinitely instead of drifting downward permanently after
// the first short month. Yearly reuses the same helper (12 months) so a Feb 29
// bill clamps to Feb 28 on non-leap years and returns to the 29th on leap ones.
export function addFrequency(dateStr, frequency, anchorDay) {
  const anchor = anchorDay || toDate(dateStr).getDate();
  if (frequency === "weekly") return addDays(dateStr, 7);
  if (frequency === "biweekly") return addDays(dateStr, 14);
  if (frequency === "yearly") return addMonthsClamped(dateStr, 12, anchor);
  if (frequency === "semiannually") return addMonthsClamped(dateStr, 6, anchor);
  if (frequency === "quarterly") return addMonthsClamped(dateStr, 3, anchor);
  return addMonthsClamped(dateStr, 1, anchor); // monthly (default)
}

// Frequencies that step by whole calendar months, and so need an anchorDay to
// keep a bill due on the 29th-31st from drifting after a short month.
export const isMonthBasedFrequency = (frequency) =>
  frequency === "monthly" || frequency === "quarterly" || frequency === "semiannually" || frequency === "yearly";
export function daysBetween(fromStr, toStr) {
  const ms = toDate(toStr).getTime() - toDate(fromStr).getTime();
  return Math.round(ms / 86400000);
}
export function addDays(dateStr, n) {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
export function firstOfMonth(dateStr) {
  const d = toDate(dateStr);
  return toKey(new Date(d.getFullYear(), d.getMonth(), 1));
}
export function addMonths(dateStr, n) {
  const d = toDate(dateStr);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
export function monthLabel(dateStr) {
  return toDate(dateStr).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
export function dayOfWeek(dateStr) {
  return toDate(dateStr).getDay(); // 0 = Sunday
}
export function daysInMonth(dateStr) {
  const d = toDate(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/* ---------------------------------- bill occurrences ---------------------------------- */

// Generates every occurrence of `bill` that falls within [rangeStart, rangeEnd]
// (inclusive, both "YYYY-MM-DD"). A non-recurring bill has at most one
// occurrence, at its dueDate. A recurring bill steps forward by its frequency
// starting at dueDate until it passes rangeEnd or its own endDate. Capped at
// 500 steps so a malformed bill (e.g. weekly with no end date, decades in the
// past) can't hang the calendar.
export function generateBillOccurrences(bill, rangeStart, rangeEnd) {
  if (!bill?.dueDate) return [];
  const occurrences = [];
  // `anchorDay` is only set on a split-off segment that begins on a clamped
  // date (e.g. Feb 28 of a bill due the 31st), so it keeps returning to the 31st.
  const anchorDay = bill.anchorDay || toDate(bill.dueDate).getDate();
  let cursor = bill.dueDate;
  let steps = 0;
  while (steps < 500) {
    if (bill.endDate && cursor > bill.endDate) break;
    if (cursor > rangeEnd) break;
    if (cursor >= rangeStart) {
      occurrences.push({ billId: bill.id, dateKey: cursor });
    }
    if (!bill.recurring) break;
    cursor = addFrequency(cursor, bill.frequency, anchorDay);
    steps += 1;
  }
  return occurrences;
}

export function occurrenceStatus(bill, dateKey, today) {
  const linked = bill.completions ? bill.completions[dateKey] : undefined;
  if (linked) return "paid";
  if (dateKey < today) return "overdue";
  return "upcoming";
}

// Earliest unpaid occurrence on or after `fromDate`, looking up to ~3 years
// ahead. Historical occurrences are handled separately so recurring bills do
// not stay stuck on an old unpaid date.
export function nextUnpaidOccurrence(bill, fromDate) {
  if (!bill?.dueDate) return null;
  const horizon = addDays(fromDate, 366 * 3);
  const occurrences = generateBillOccurrences(bill, fromDate, horizon);
  return occurrences.find((o) => !(bill.completions && bill.completions[o.dateKey])) || null;
}

export function latestUnpaidOccurrence(bill, throughDate) {
  if (!bill?.dueDate) return null;
  const occurrences = generateBillOccurrences(bill, bill.dueDate, throughDate);
  return [...occurrences].reverse().find((o) => !(bill.completions && bill.completions[o.dateKey])) || null;
}

export function sortedBillsList(bills, today) {
  return [...(bills || [])].sort((a, b) => {
    const na = nextUnpaidOccurrence(a, today)?.dateKey || "9999-99-99";
    const nb = nextUnpaidOccurrence(b, today)?.dateKey || "9999-99-99";
    if (na !== nb) return na < nb ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

/* ---------------------------------- goals ---------------------------------- */

// Everything is compared in whole cents (see utils/money.js): an account funded to exactly
// the target can sum to 999.9999999999999 in floating point, which used to leave a
// finished goal stuck at 99.99...% and never marked achieved.
export function goalProgress(goal, balances, today) {
  const target = roundMoney(goal.targetAmount);
  const current = roundMoney(goal.trackingMode === "account"
    ? (goal.accountId ? (balances[goal.accountId] || 0) : 0)
    : (goal.manualAmount || 0));
  const pct = target > 0 ? Math.max(0, Math.min(100, (toCents(current) / toCents(target)) * 100)) : 0;
  const achieved = target > 0 && moneyAtLeast(current, target);
  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
  return { current, target, pct, achieved, daysLeft, overdue: !achieved && daysLeft != null && daysLeft < 0 };
}

export function sortedGoalsList(goals) {
  return [...(goals || [])].sort((a, b) => {
    const da = a.targetDate || "9999-99-99";
    const db = b.targetDate || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

/* ---------------------------------- bill categories across budgets ---------------------------------- */
// A budget's categories are real Category records that belong to that one budget (planId).
// Every time a repeating budget rolls over, its categories are re-created with NEW ids, so a
// bill saved against last month's "Groceries" keeps pointing at last month's record forever -
// and a transaction created from that bill would be filed under the old budget, not counted
// against the current one. Instead of rewriting bills at rollover, the category is resolved
// at the moment it's needed (when a transaction is created from the bill): follow the NAME
// into whichever budget is active right now, and if it isn't there, leave it uncategorized.

const normName = (s) => String(s ?? "").trim().toLowerCase();

// What to remember on a bill about its category, so it can still be found by name after the
// budget it was picked from has rolled over or been deleted. Only budget-owned categories need
// this: a general category keeps the same id for good.
export function billCategorySnapshot(categoryId, categories) {
  const list = categories || [];
  const cat = categoryId ? list.find((c) => c.id === categoryId) : null;
  if (!cat || !cat.planId) return { categoryName: null, categoryParentName: null };
  const parent = cat.parentCategoryId ? list.find((c) => c.id === cat.parentCategoryId) : null;
  return { categoryName: cat.name, categoryParentName: parent ? parent.name : null };
}

// The category id a transaction created from `bill` should get today (or null = uncategorized).
//  - a general category, or one already in the active budget: used as is;
//  - a category of some other budget (or one that no longer exists): the category with the same
//    name in the ACTIVE budget (preferring one under the same parent for itemized expenses);
//  - no such category, or no active budget: null.
export function resolveBillCategoryId(bill, categories, activeBudgetId) {
  if (!bill) return null;
  const list = categories || [];
  const cat = bill.categoryId ? list.find((c) => c.id === bill.categoryId) : null;
  if (cat && (!cat.planId || cat.planId === activeBudgetId)) return cat.id;

  const name = cat ? cat.name : bill.categoryName;
  if (!name || !activeBudgetId) return null;
  const parentName = cat
    ? (cat.parentCategoryId ? list.find((c) => c.id === cat.parentCategoryId)?.name : null)
    : bill.categoryParentName;
  const type = cat ? cat.type : (bill.type === "income" ? "income" : "expense");

  const candidates = list.filter((c) => c.planId === activeBudgetId && c.type === type && normName(c.name) === normName(name));
  const sameParent = candidates.find((c) => normName(c.parentCategoryId ? list.find((p) => p.id === c.parentCategoryId)?.name : null) === normName(parentName));
  return (sameParent || candidates[0])?.id || null;
}

/* ---------------------------------- referential cleanup ---------------------------------- */
// Mirrors the pattern used in state/categories.js for transactions: when
// something a bill points at goes away, the bill shouldn't keep a dangling
// reference or a phantom "paid" mark.

export function clearRemovedTransactionFromBills(bills, deletedTxId) {
  return bills.map((b) => {
    if (!b.completions) return b;
    const entry = Object.entries(b.completions).find(([, v]) => v === deletedTxId);
    if (!entry) return b;
    const completions = { ...b.completions };
    delete completions[entry[0]];
    return { ...b, completions };
  });
}

export function clearRemovedCategoryFromBills(bills, removedCategoryIds) {
  if (!removedCategoryIds || removedCategoryIds.length === 0) return bills;
  return bills.map((b) => (removedCategoryIds.includes(b.categoryId) ? { ...b, categoryId: null } : b));
}

// (Loading/import sanitizing of bills and goals lives in state/validate.js, which repairs or sets aside
// records instead of silently dropping them.)

/* ---------------------------------- recurring series ---------------------------------- */
// A recurring bill behaves like a repeating calendar event. Paid / linked state
// belongs to one occurrence (completions are keyed by date). Editing the bill
// itself with "this and following" splits it: the existing bill is closed the
// day before the occurrence being edited (it keeps its own history), and a new
// bill carrying the edited values starts from that occurrence. Every segment of
// one bill shares a `seriesId`, which is what "all" and the Overdue count use.
// Bills saved before this existed have no seriesId and simply use their own id.

export const seriesOf = (bill) => bill.seriesId || bill.id;
export const seriesMembers = (bills, bill) => (bills || []).filter((b) => seriesOf(b) === seriesOf(bill));
// True when deleting/editing needs the "this and following / all" choice.
export const isSeries = (bills, bill) => !!bill.recurring || seriesMembers(bills, bill).length > 1;

const SERIES_FIELDS = ["name", "type", "amount", "accountId", "categoryId", "notes"];
const FIELD_LABELS = { name: "name", type: "type", amount: "amount", accountId: "account", categoryId: "category", notes: "notes" };
const norm = (v) => (v == null || v === "" ? null : v);
const niceDate = (key) => toDate(key).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const isOccurrence = (bill, dateKey) => !!dateKey && generateBillOccurrences(bill, dateKey, dateKey).length > 0;

// Which occurrence a bill's modal should be about: the one that was clicked,
// otherwise the next unpaid one, otherwise the latest overdue one.
export function pickOccurrence(bill, today, preferred) {
  if (isOccurrence(bill, preferred)) return preferred;
  return nextUnpaidOccurrence(bill, today)?.dateKey || latestUnpaidOccurrence(bill, addDays(today, -1))?.dateKey || bill.dueDate;
}

// Start of the next segment of this bill's series (a later "version" that
// takes over), or null. Used to explain what "this and following" stops at.
export function nextSegmentStart(bills, bill) {
  const later = seriesMembers(bills, bill).filter((m) => m.id !== bill.id && m.dueDate > bill.dueDate).map((m) => m.dueDate).sort();
  return later[0] || null;
}

// Last occurrence strictly before `beforeDate` across the whole series.
function previousOccurrence(bills, bill, beforeDate) {
  let prev = null;
  seriesMembers(bills, bill).forEach((m) => {
    const occ = generateBillOccurrences(m, m.dueDate, addDays(beforeDate, -1));
    const last = occ.length ? occ[occ.length - 1].dateKey : null;
    if (last && (!prev || last > prev)) prev = last;
  });
  return prev;
}

// What did the form change relative to the bill as it was opened (at `occDate`)?
export function describeBillChanges(bill, values, occDate) {
  const labels = SERIES_FIELDS.filter((k) => norm(bill[k]) !== norm(values[k])).map((k) => FIELD_LABELS[k]);
  const fieldsChanged = labels.length > 0;
  const startDate = bill.recurring ? occDate : bill.dueDate;
  const planLabels = [];
  if (!!values.recurring !== !!bill.recurring) planLabels.push("repeat");
  else if (values.recurring && values.frequency !== bill.frequency) planLabels.push("frequency");
  if (values.dueDate !== startDate) planLabels.push("due date");
  const endChanged = norm(bill.endDate) !== norm(values.recurring ? values.endDate : null);
  if (endChanged) planLabels.push("end date");
  return {
    fieldsChanged,
    planChanged: planLabels.some((l) => l !== "end date"),
    endChanged,
    labels: [...labels, ...planLabels],
    any: fieldsChanged || planLabels.length > 0,
  };
}

// Re-keys payment marks onto a new schedule: the edited occurrence's own mark
// follows it to its new date, and any other mark is kept only if it still lands
// on an occurrence of the new schedule.
function remapMarks(marks, newBill, fromDate, toDate_) {
  const keys = Object.keys(marks || {});
  if (!keys.length) return {};
  const maxKey = keys.reduce((a, b) => (a > b ? a : b));
  const valid = new Set(generateBillOccurrences({ ...newBill, completions: {} }, toDate_, maxKey > toDate_ ? maxKey : toDate_).map((o) => o.dateKey));
  const out = {};
  keys.forEach((k) => { if (k !== fromDate && valid.has(k)) out[k] = marks[k]; });
  if (marks[fromDate] !== undefined) out[toDate_] = marks[fromDate];
  return out;
}

const splitMarks = (marks, pivot) => {
  const before = {};
  const after = {};
  Object.entries(marks || {}).forEach(([k, v]) => { (k < pivot ? before : after)[k] = v; });
  return { before, after };
};

// Applies a bill-modal save to a list of bills. Pure: returns { bills } or { error }.
//   values: the form's fields (name, type, amount, accountId, categoryId, dueDate,
//           recurring, frequency, endDate, notes)
//   dateKey: the occurrence the modal was opened for
//   scope: "following" (default) | "all" - only used for recurring bills
//   newId: id for a new segment, if a split is needed
export function applyBillEdit(bills, { billId, dateKey, values, scope = "following", newId }) {
  const B = bills.find((b) => b.id === billId);
  if (!B) return { error: "That bill no longer exists.", bills };
  const sid = seriesOf(B);
  const fields = {
    name: values.name, type: values.type, amount: values.amount, accountId: values.accountId,
    categoryId: values.categoryId || null, notes: values.notes || "",
    categoryName: values.categoryName || null, categoryParentName: values.categoryParentName || null,
  };
  const recurring2 = !!values.recurring;
  const freq2 = recurring2 ? values.frequency : null;
  const end2 = recurring2 ? (values.endDate || null) : null;
  const replace = (list) => bills.flatMap((b) => (b.id === B.id ? list : [b]));
  const inSeries = seriesMembers(bills, B).length > 1;

  // One-time bill (or a one-time segment): edit in place; its single mark follows its date.
  if (!B.recurring) {
    if (end2 && values.dueDate > end2) return { error: "The end date is before the due date.", bills };
    const next = nextSegmentStart(bills, B);
    const covered = recurring2 ? end2 : values.dueDate;
    if (next && (values.dueDate >= next || !covered || covered >= next)) {
      return { error: `That overlaps a later version of this bill that starts ${niceDate(next)}.`, bills };
    }
    const completions = { ...(B.completions || {}) };
    if (values.dueDate !== B.dueDate && completions[B.dueDate] !== undefined) {
      completions[values.dueDate] = completions[B.dueDate];
      delete completions[B.dueDate];
    }
    const out = { ...B, ...fields, dueDate: values.dueDate, recurring: recurring2, frequency: freq2, endDate: end2, completions };
    if (inSeries) out.seriesId = sid;
    return { bills: replace([out]), savedId: B.id };
  }

  // Recurring bill.
  const D = isOccurrence(B, dateKey) ? dateKey : B.dueDate;
  const ch = describeBillChanges(B, values, D);
  if (!ch.any) return { bills, savedId: B.id, noop: true };

  // Only the end date changed: just move the end of this segment.
  if (!ch.fieldsChanged && !ch.planChanged) {
    if (end2 && end2 < D) return { error: `The end date can't be before this occurrence (${niceDate(D)}). To remove this occurrence and the ones after it, use Delete.`, bills };
    const next = nextSegmentStart(bills, B);
    if (next && (!end2 || end2 >= next)) return { error: `That overlaps a later version of this bill that starts ${niceDate(next)}.`, bills };
    return { bills: replace([{ ...B, endDate: end2 }]), savedId: B.id };
  }

  // "All": the descriptive fields on every segment. Dates can't be changed this way.
  if (scope === "all") {
    if (ch.planChanged || ch.endChanged) return { error: "Date, frequency and end date changes can only apply from this occurrence onward.", bills };
    // Only the fields that were actually edited go to the other segments; the
    // rest (e.g. an amount that differs between versions) are left as they are.
    const edited = Object.fromEntries(SERIES_FIELDS.filter((k) => norm(B[k]) !== norm(fields[k])).map((k) => [k, fields[k]]));
    // The remembered category name travels with the category it describes.
    if ("categoryId" in edited) { edited.categoryName = fields.categoryName; edited.categoryParentName = fields.categoryParentName; }
    return { bills: bills.map((b) => (seriesOf(b) === sid ? { ...b, ...edited } : b)), savedId: B.id };
  }

  // "This and following".
  const D2 = values.dueDate;
  const prev = previousOccurrence(bills, B, D);
  if (prev && D2 <= prev) return { error: `Pick a date after the previous occurrence (${niceDate(prev)}). To change earlier dates, edit that occurrence instead.`, bills };
  if (end2 && D2 > end2) return { error: "The end date is before the due date.", bills };
  const next = nextSegmentStart(bills, B);
  const covered = recurring2 ? end2 : D2;
  if (next && (D2 >= next || !covered || covered >= next)) {
    return { error: `That overlaps a later version of this bill that starts ${niceDate(next)}. Set an end date before then.`, bills };
  }

  const base = { ...B, ...fields, dueDate: D2, recurring: recurring2, frequency: freq2, endDate: end2, seriesId: sid };
  delete base.anchorDay;
  if (D2 === D && recurring2 && isMonthBasedFrequency(freq2)) {
    const originalAnchor = B.anchorDay || toDate(B.dueDate).getDate();
    if (originalAnchor !== toDate(D2).getDate()) base.anchorDay = originalAnchor;
  }

  // First occurrence of this segment: nothing precedes it, so edit it in place.
  if (D === B.dueDate) {
    const { before, after } = splitMarks(B.completions, D);
    return { bills: replace([{ ...base, id: B.id, completions: { ...before, ...remapMarks(after, base, D, D2) } }]), savedId: B.id };
  }

  // Otherwise split: close this segment the day before, start a new one here.
  const { before, after } = splitMarks(B.completions, D);
  const closed = { ...B, seriesId: sid, endDate: addDays(D, -1), completions: before };
  const created = { ...base, id: newId, completions: remapMarks(after, base, D, D2) };
  return { bills: replace([closed, created]), savedId: created.id };
}

// Deletes from a bill series.
//   scope "all": every segment, with its history.
//   scope "following": this occurrence onward, within this segment (a later
//   version that takes over after this segment is kept). Earlier occurrences
//   and their payment history stay.
export function removeBillScope(bills, { billId, dateKey, scope = "all" }) {
  const B = bills.find((b) => b.id === billId);
  if (!B) return bills;
  const sid = seriesOf(B);
  if (scope === "all") return bills.filter((b) => seriesOf(b) !== sid);
  const D = B.recurring && isOccurrence(B, dateKey) ? dateKey : B.dueDate;
  if (!B.recurring || D <= B.dueDate) return bills.filter((b) => b.id !== B.id);
  const { before } = splitMarks(B.completions, D);
  return bills.map((b) => (b.id === B.id ? { ...B, seriesId: sid, endDate: addDays(D, -1), completions: before } : b));
}

// Existing transactions that could be linked to an occurrence: same account and
// direction, nearest in date, and not already linked to some bill occurrence.
export function linkableTransactions(transactions, bills, bill, dateKey) {
  const linked = new Set();
  (bills || []).forEach((b) => Object.values(b.completions || {}).forEach((v) => { if (typeof v === "string") linked.add(v); }));
  return (transactions || [])
    .filter((t) => t.accountId === bill.accountId && t.type === bill.type && !linked.has(t.id))
    .map((t) => ({ t, gap: Math.abs(new Date(t.date) - new Date(dateKey)) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6)
    .map((x) => x.t);
}
