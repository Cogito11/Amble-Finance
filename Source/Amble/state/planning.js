// state/planning.js
//
import { addMonthsClamped, toLocalDateStr } from "../utils/dates";

// Data model added by the "Plan" tab:
//
// Bill (a scheduled/recurring transaction template):
//   {
//     id, name, amount, type: "expense" | "income",
//     accountId, categoryId,               // both nullable, mirrors TransactionModal
//     dueDate,                             // "YYYY-MM-DD" - first/only occurrence
//     recurring: boolean,
//     frequency: "weekly" | "biweekly" | "monthly" | "yearly",
//     endDate,                             // "YYYY-MM-DD" or null - stop generating after this date
//     notes,
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

// Steps a date forward by one cycle of `frequency`. Monthly/yearly delegate to
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
  return addMonthsClamped(dateStr, 1, anchor); // monthly (default)
}
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
  const anchorDay = toDate(bill.dueDate).getDate();
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
// ahead. Used for "next due" summaries (Plan view's upcoming list, sorting).
export function nextUnpaidOccurrence(bill, fromDate) {
  if (!bill?.dueDate) return null;
  const horizon = addDays(fromDate, 366 * 3);
  const occurrences = generateBillOccurrences(bill, bill.dueDate < fromDate ? bill.dueDate : fromDate, horizon);
  return occurrences.find((o) => !(bill.completions && bill.completions[o.dateKey])) || null;
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

export function goalProgress(goal, balances, today) {
  const target = goal.targetAmount || 0;
  const current = goal.trackingMode === "account"
    ? (goal.accountId ? (balances[goal.accountId] || 0) : 0)
    : (goal.manualAmount || 0);
  const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
  const achieved = target > 0 && current >= target;
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
