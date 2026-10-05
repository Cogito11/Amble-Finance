import { isValidDateStr } from "../utils/dates";
import { uid } from "../utils/misc";
import { migrateAccountOrder } from "./accounts";
import { defaultState, migrateBudgetOrder } from "./budgets";
import { FREQUENCY_OPTIONS } from "./planning";

// One validator for every way saved data enters the app: loading it at startup, receiving a
// change from another window, and importing a backup file. Before this, each of those trusted
// the shape of the data - a single malformed record (a null in the transactions list, an amount
// stored as text, a bill with no date) could crash a screen, and because the app auto-saves,
// the crash would then repeat on every launch.
//
// The rule it follows: never silently lose anything.
//   - REPAIR what would crash the app or corrupt the math, when the fix is unambiguous
//     (an amount saved as the text "12.50" becomes 12.5; a missing id gets a new one).
//   - KEEP anything the app can already display and handle, even if it looks odd (a
//     transaction with a blank date shows up in the "no valid date" banner; a transaction
//     pointing at a deleted account just shows "-" for the account).
//   - SET ASIDE ("quarantine") only records that can't be used at all (not a record, an
//     unknown transaction type, no usable amount). They are returned in the report so the
//     caller can save them somewhere recoverable - they are never just discarded.
// Every repair and every set-aside record is counted in the returned report so the person can
// be told exactly what happened.

export const BACKUP_APP_ID = "amble-finance";
export const BACKUP_VERSION = 1;

const TRANSACTION_TYPES = ["income", "expense", "transfer"];
const ACCOUNT_TYPES = ["checking", "savings", "cash", "asset", "credit", "loan"];
const FREQUENCIES = FREQUENCY_OPTIONS.map((f) => f.value);

/* ---------------------------------- small helpers ---------------------------------- */

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A number, or text that is entirely a number ("12.50"). Anything else -> null.
function toFiniteNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const asText = (v, fallback = "") => {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
};

// Collects what happened so the caller can tell the person.
function makeReport() {
  const repairs = new Map();
  const quarantined = [];
  return {
    repair(collection, what) {
      const key = `${collection}|${what}`;
      const prev = repairs.get(key);
      repairs.set(key, { collection, what, count: (prev ? prev.count : 0) + 1 });
    },
    quarantine(collection, reason, record) {
      quarantined.push({ collection, reason, record });
    },
    finish(counts) {
      const repairList = [...repairs.values()];
      return {
        counts,
        repairs: repairList,
        quarantined,
        repairedCount: repairList.reduce((n, r) => n + r.count, 0),
        quarantinedCount: quarantined.length,
      };
    },
  };
}

// Hands out unique, usable ids for one collection. A missing/invalid id is replaced, and so is
// the second record to claim an id already taken (duplicates make "delete this one" remove both).
function makeIdClaimer(report, collection) {
  const seen = new Set();
  return (rawId) => {
    const id = typeof rawId === "string" && rawId !== "" ? rawId : (typeof rawId === "number" && Number.isFinite(rawId) ? String(rawId) : null);
    if (id !== null && !seen.has(id)) { seen.add(id); return { id, changed: id !== rawId }; }
    let fresh = uid();
    while (seen.has(fresh)) fresh = uid();
    seen.add(fresh);
    report.repair(collection, id === null ? "records without an id were given one" : "records with a duplicate id were given a new one");
    return { id: fresh, changed: true };
  };
}

// Runs `validate` over a list. `validate(record, ctx)` returns { record } (kept, possibly
// repaired) or { reject: "why" } (set aside). A value that isn't a list at all is set aside whole.
function validateList(list, collection, validate, report) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) {
    report.quarantine(collection, "expected a list", list);
    return [];
  }
  const claimId = makeIdClaimer(report, collection);
  const out = [];
  for (const item of list) {
    if (!isRecord(item)) { report.quarantine(collection, "not a record", item); continue; }
    const res = validate(item, { claimId, report });
    if (res.reject) report.quarantine(collection, res.reject, item);
    else out.push(res.record);
  }
  return out;
}

// Builds a repaired copy of `rec` only if something actually changed, so records that were
// already fine keep their identity (React's memoized rows don't re-render for nothing).
//
// `optional` lists fields an older record may legitimately omit: for those, an absent key that
// would only be filled with an empty value (null / "" / false) isn't a real change. Required
// fields (date, description, amount...) are always filled in when missing.
function patchRecord(rec, patch, optional = []) {
  const changedKeys = Object.keys(patch).filter((k) => {
    if (patch[k] === rec[k]) return false;
    const emptyFill = rec[k] === undefined && (patch[k] === null || patch[k] === "" || patch[k] === false);
    return !(emptyFill && optional.includes(k));
  });
  return changedKeys.length ? { ...rec, ...patch } : rec;
}

// Free-text fields that get rendered on screen (notes, institution...). React throws if asked to
// render an object, so anything stored as a non-string is converted (numbers) or blanked.
function textPatch(rec, keys) {
  const patch = {};
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== null && typeof rec[k] !== "string") patch[k] = asText(rec[k], "");
  return patch;
}
// Things that must be a plain string or be absent (a stray number/object is removed, not shown).
function stringOrAbsent(rec, keys) {
  const patch = {};
  for (const k of keys) if (rec[k] !== undefined && typeof rec[k] !== "string") patch[k] = undefined;
  return patch;
}
// A list position: a finite number or absent (absent ones are numbered by migrateAccountOrder / migrateBudgetOrder).
const orderPatch = (rec) => (rec.order !== undefined && !(typeof rec.order === "number" && Number.isFinite(rec.order)) ? { order: undefined } : {});
const linkId = (v) => (typeof v === "string" && v !== "" ? v : null);
const dayAnchor = (v) => (Number.isInteger(v) && v >= 1 && v <= 31 ? v : undefined);

const cleanDate = (v) => {
  if (typeof v !== "string") return { value: "", changed: v !== undefined && v !== null };
  // "2026-10-04T00:00:00.000Z" (exported by some other tools) -> "2026-10-04"
  if (/^\d{4}-\d{2}-\d{2}T/.test(v) && isValidDateStr(v.slice(0, 10))) return { value: v.slice(0, 10), changed: true };
  return { value: v, changed: false };
};

/* ---------------------------------- per-collection rules ---------------------------------- */

function validateTransaction(t, { claimId, report }) {
  if (!TRANSACTION_TYPES.includes(t.type)) return { reject: "unknown transaction type" };
  const amount = toFiniteNumber(t.amount);
  if (amount === null) return { reject: "no usable amount" };
  if (amount < 0) return { reject: "negative amount" };

  const { id, changed: idChanged } = claimId(t.id);
  const date = cleanDate(t.date);
  if (date.changed) report.repair("transactions", "dates were fixed up");
  if (typeof t.amount === "string") report.repair("transactions", "amounts stored as text were converted to numbers");
  const description = typeof t.description === "string" ? t.description : asText(t.description);
  if (t.description !== undefined && t.description !== null && typeof t.description !== "string") report.repair("transactions", "descriptions stored as non-text were converted");

  const idOrOriginal = idChanged ? id : t.id;
  return {
    record: patchRecord(t, {
      id: idOrOriginal,
      amount,
      date: date.value,
      description,
      accountId: typeof t.accountId === "string" ? t.accountId : asText(t.accountId),
      toAccountId: t.type === "transfer" ? (typeof t.toAccountId === "string" ? t.toAccountId : asText(t.toAccountId, null) || null) : (t.toAccountId ?? null),
      categoryId: t.categoryId ? asText(t.categoryId, null) : null,
      ...textPatch(t, ["notes"]),
    }, ["toAccountId", "categoryId"]),
  };
}

function validateAccount(a, { claimId, report }) {
  const { id, changed } = claimId(a.id);
  const balance = toFiniteNumber(a.startingBalance);
  if (balance === null && a.startingBalance !== undefined && a.startingBalance !== null) report.repair("accounts", "unreadable starting balances were reset to 0");
  if (typeof a.startingBalance === "string" && balance !== null) report.repair("accounts", "starting balances stored as text were converted");
  const name = typeof a.name === "string" && a.name.trim() !== "" ? a.name : "Untitled account";
  if (name !== a.name) report.repair("accounts", "accounts without a name were called \"Untitled account\"");
  const type = ACCOUNT_TYPES.includes(a.type) ? a.type : "checking";
  if (type !== a.type) report.repair("accounts", "accounts with an unknown type were set to checking");
  const rate = toFiniteNumber(a.interestRate);
  return {
    record: patchRecord(a, {
      id: changed ? id : a.id,
      name,
      type,
      startingBalance: balance === null ? 0 : balance,
      interestRate: rate !== null && rate >= 0 ? rate : null,
      closed: !!a.closed,
      ...orderPatch(a),
      ...textPatch(a, ["institution", "notes"]),
    }, ["interestRate", "closed"]),
  };
}

function validateCategory(c, { claimId, report }) {
  const { id, changed } = claimId(c.id);
  const name = typeof c.name === "string" && c.name.trim() !== "" ? c.name : "Untitled category";
  if (name !== c.name) report.repair("categories", "categories without a name were called \"Untitled category\"");
  const type = c.type === "income" || c.type === "expense" ? c.type : "expense";
  if (type !== c.type) report.repair("categories", "categories with an unknown type were set to expense");
  const limit = toFiniteNumber(c.limit);
  return {
    record: patchRecord(c, {
      id: changed ? id : c.id,
      name,
      type,
      limit: limit !== null && limit >= 0 ? limit : 0,
      planId: typeof c.planId === "string" && c.planId !== "" ? c.planId : null,
      ...stringOrAbsent(c, ["color"]),
    }, ["planId"]),
  };
}

// Nested lists inside a budget (its categories, line items, income rows).
function cleanNested(list, label, parentName, validate, report) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) { report.quarantine("budgets", `${label} of "${parentName}" weren't a list`, list); return []; }
  const claim = makeIdClaimer(report, "budgets");
  const out = [];
  for (const item of list) {
    if (!isRecord(item)) { report.quarantine("budgets", `${label} entry of "${parentName}" wasn't a record`, item); continue; }
    out.push(validate(item, claim));
  }
  return out;
}

const money = (v) => { const n = toFiniteNumber(v); return n !== null && n >= 0 ? n : 0; };
const dateOrNull = (v) => (isValidDateStr(v) ? v : null);

function validateBudget(b, { claimId, report }) {
  const { id, changed } = claimId(b.id);
  const name = typeof b.name === "string" && b.name.trim() !== "" ? b.name : "Untitled budget";
  if (name !== b.name) report.repair("budgets", "budgets without a name were called \"Untitled budget\"");
  const startDate = dateOrNull(b.startDate);
  const endDate = dateOrNull(b.endDate);
  if ((b.startDate && !startDate) || (b.endDate && !endDate)) report.repair("budgets", "budgets with an unreadable start/end date had it cleared");

  const categories = cleanNested(b.categories, "categories", name, (c, claim) => {
    const cid = claim(c.id);
    const mode = c.mode === "items" ? "items" : "bulk";
    const items = cleanNested(c.items, "line items", name, (it, claimItem) => {
      const iid = claimItem(it.id);
      return { ...it, id: iid.id, name: asText(it.name, "Untitled expense"), amount: money(it.amount), date: dateOrNull(it.date), categoryId: linkId(it.categoryId) };
    }, report);
    return { ...c, id: cid.id, name: asText(c.name, "Untitled category") || "Untitled category", mode, bulkAmount: money(c.bulkAmount), date: dateOrNull(c.date), items, categoryId: linkId(c.categoryId), ...stringOrAbsent(c, ["color"]) };
  }, report);

  const incomeItems = cleanNested(b.incomeItems, "income rows", name, (it, claim) => {
    const iid = claim(it.id);
    return { ...it, id: iid.id, name: asText(it.name, "Income"), mode: it.mode === "category" ? "category" : "manual", amount: money(it.amount), categoryId: linkId(it.categoryId) };
  }, report);

  const repeat = isRecord(b.repeat) ? b.repeat : { enabled: false, frequency: "monthly" };
  return {
    record: {
      ...b,
      id: changed ? id : b.id,
      name,
      startDate,
      endDate,
      income: money(b.income),
      incomeItems,
      categories,
      active: !!b.active,
      repeat: {
        ...repeat,
        enabled: !!repeat.enabled,
        frequency: ["weekly", "biweekly", "monthly", "match"].includes(repeat.frequency) ? repeat.frequency : "monthly",
        anchorDay: dayAnchor(repeat.anchorDay),
        endAnchorDay: dayAnchor(repeat.endAnchorDay),
      },
      ...orderPatch(b),
      ...stringOrAbsent(b, ["dateCreated"]),
      ...textPatch(b, ["notes"]),
    },
  };
}

function validateBill(b, { claimId, report }) {
  const amount = toFiniteNumber(b.amount);
  if (amount === null || amount < 0) return { reject: "no usable amount" };
  if (!isValidDateStr(b.dueDate)) return { reject: "no valid due date" };
  const { id, changed } = claimId(b.id);
  if (typeof b.amount === "string") report.repair("bills", "amounts stored as text were converted to numbers");
  const recurring = !!b.recurring;
  const frequency = recurring ? (FREQUENCIES.includes(b.frequency) ? b.frequency : "monthly") : null;
  if (recurring && frequency !== b.frequency) report.repair("bills", "repeating bills with an unknown frequency were set to monthly");
  const completions = {};
  if (isRecord(b.completions)) {
    for (const [key, value] of Object.entries(b.completions)) {
      if (isValidDateStr(key) && (value === true || (typeof value === "string" && value !== ""))) completions[key] = value;
      else report.repair("bills", "unreadable paid-marks were dropped");
    }
  }
  return {
    record: {
      ...b,
      id: changed ? id : b.id,
      name: asText(b.name, "Untitled bill") || "Untitled bill",
      type: b.type === "income" ? "income" : "expense",
      amount,
      accountId: asText(b.accountId),
      categoryId: b.categoryId ? asText(b.categoryId, null) : null,
      dueDate: b.dueDate,
      recurring,
      frequency,
      endDate: recurring ? dateOrNull(b.endDate) : null,
      completions,
      ...textPatch(b, ["notes"]),
      ...stringOrAbsent(b, ["seriesId", "categoryName", "categoryParentName"]),
    },
  };
}

function validateGoal(g, { claimId, report }) {
  const { id, changed } = claimId(g.id);
  const target = toFiniteNumber(g.targetAmount);
  if (target === null || target < 0) report.repair("goals", "goals with an unreadable target amount were set to 0");
  return {
    record: {
      ...g,
      id: changed ? id : g.id,
      name: asText(g.name, "Untitled goal") || "Untitled goal",
      targetAmount: target !== null && target >= 0 ? target : 0,
      targetDate: dateOrNull(g.targetDate),
      trackingMode: g.trackingMode === "account" ? "account" : "manual",
      accountId: g.accountId ? asText(g.accountId, null) : null,
      manualAmount: money(g.manualAmount),
      ...textPatch(g, ["notes"]),
      ...stringOrAbsent(g, ["dateCreated"]),
    },
  };
}

/* ---------------------------------- the entry point ---------------------------------- */

// Validates and repairs a whole saved-state object (already JSON-parsed).
//   raw:          the parsed data
//   keepUnknown:  keep top-level keys this version doesn't know about (true when loading, so
//                 data written by a newer version survives; false when importing a file)
// Returns { ok: true, state, report } or { ok: false, error }. Never throws.
export function validateState(raw, { keepUnknown = true } = {}) {
  if (!isRecord(raw)) return { ok: false, error: "The saved data isn't an object." };
  try {
    const report = makeReport();
    const base = defaultState();

    const accounts = migrateAccountOrder(validateList(raw.accounts, "accounts", validateAccount, report));
    // Data from before budgets existed has no `categories`: fall back to the general ones only,
    // never to the seeded default budget's categories (their budget wouldn't exist).
    const categories = raw.categories === undefined ? base.categories.filter((c) => !c.planId) : validateList(raw.categories, "categories", validateCategory, report);
    const transactions = validateList(raw.transactions, "transactions", validateTransaction, report);
    const plans = migrateBudgetOrder(validateList(raw.plans, "budgets", validateBudget, report));
    const bills = validateList(raw.bills, "bills", validateBill, report);
    const goals = validateList(raw.goals, "goals", validateGoal, report);

    let currency = base.currency;
    if (typeof raw.currency === "string" && /^[A-Za-z]{3}$/.test(raw.currency.trim())) currency = raw.currency.trim().toUpperCase();
    else if (raw.currency !== undefined && raw.currency !== null) report.repair("settings", "an unreadable currency was reset to USD");

    const state = {
      ...(keepUnknown ? raw : {}),
      accounts, categories, transactions, plans, bills, goals,
      currency,
      lastBackupAt: typeof raw.lastBackupAt === "string" ? raw.lastBackupAt : null,
    };
    return {
      ok: true,
      state,
      report: report.finish({ accounts: accounts.length, categories: categories.length, transactions: transactions.length, budgets: plans.length, bills: bills.length, goals: goals.length }),
    };
  } catch (error) {
    // Defence in depth: the rules above shouldn't throw, but if some shape slips through, report it
    // as unreadable (the caller keeps the original untouched) instead of crashing the app.
    return { ok: false, error: `The saved data couldn't be checked: ${error && error.message ? error.message : error}` };
  }
}

/* ---------------------------------- backup files ---------------------------------- */

// Reads the text of a backup file (as written by "Export backup": { app, version, exportedAt, data }),
// or a bare state object. Returns { ok: true, state, report, exportedAt } or { ok: false, error }.
// Nothing is applied here - the caller decides what to do with the validated result.
export function parseBackupText(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: "That file isn't valid JSON, so it can't be an Amble backup." }; }
  if (!isRecord(parsed)) return { ok: false, error: "That file doesn't look like an Amble backup." };

  const wrapped = isRecord(parsed.data);
  if (wrapped && typeof parsed.version === "number" && parsed.version > BACKUP_VERSION) {
    return { ok: false, error: "That backup was made by a newer version of Amble. Update Amble first, then import it." };
  }
  const data = wrapped ? parsed.data : parsed;
  if (!Array.isArray(data.accounts) || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) {
    return { ok: false, error: "That file doesn't look like an Amble backup (it's missing accounts, categories or transactions)." };
  }
  const result = validateState(data, { keepUnknown: false });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, state: result.state, report: result.report, exportedAt: wrapped && typeof parsed.exportedAt === "string" ? parsed.exportedAt : null };
}

// One plain-English line about a validation report, for notices and dialogs. "" when clean.
export function describeReport(report) {
  if (!report) return "";
  const parts = [];
  if (report.repairedCount) parts.push(`repaired ${report.repairedCount} record${report.repairedCount === 1 ? "" : "s"}`);
  if (report.quarantinedCount) parts.push(`set aside ${report.quarantinedCount} that couldn't be read`);
  return parts.join(" and ");
}
