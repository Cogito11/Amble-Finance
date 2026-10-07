import { MAX_MONEY, checkMoneyInput } from "../utils/money";
import { isValidDateStr } from "../utils/dates";

// Pure validation for the add/edit forms. Each checker returns:
//   { valid, hint, kind, ...parsedValues }
// - `hint` is a short sentence explaining why Save is disabled ("" when valid)
// - `kind` is "empty" (not filled in yet - shown quietly) or "invalid" (something typed is
//   wrong - shown in red), or null when valid
// - the parsed values (amounts already rounded to cents) are what the form should save, so
//   a form never persists text it merely *looked* like a number.
// Keeping this out of the components is what lets it be tested without a browser, and keeps
// all five forms agreeing on what a valid amount or date is.

const ok = (extra = {}) => ({ valid: true, hint: "", kind: null, ...extra });
const empty = (hint) => ({ valid: false, hint, kind: "empty" });
const invalid = (hint) => ({ valid: false, hint, kind: "invalid" });

const POSITIVE = { min: 0.01 };
const NON_NEGATIVE = { min: 0 };
const ANY_SIGN = { min: -MAX_MONEY };

function moneyProblem(error, options) {
  if (error === "empty") return empty("Enter an amount.");
  if (error === "invalid") return invalid("That isn't a valid amount.");
  if (error === "too_large") return invalid("That amount is too large.");
  return invalid(options === NON_NEGATIVE ? "Amount can't be negative." : "Amount must be greater than zero.");
}

// An amount field: checkMoney(text, POSITIVE) -> { problem } or { value }.
function checkMoney(text, options) {
  const { value, error } = checkMoneyInput(text, options);
  return error ? { problem: moneyProblem(error, options) } : { value };
}

function dateProblem(value, { required }) {
  if (!value) return required ? empty("Choose a date.") : null;
  return isValidDateStr(value) ? null : invalid("That isn't a valid date.");
}

export function checkTransactionForm({ type, date, amount, accountId, toAccountId }) {
  const amt = checkMoney(amount, POSITIVE);
  if (amt.problem) return amt.problem;
  const dateIssue = dateProblem(date, { required: true });
  if (dateIssue) return dateIssue;
  if (!accountId) return empty("Choose an account.");
  if (type === "transfer") {
    if (!toAccountId) return empty("Choose the account to transfer to.");
    if (toAccountId === accountId) return invalid("Choose two different accounts.");
  }
  return ok({ amount: amt.value });
}

export function checkBillForm({ name, amount, accountId, dueDate, recurring, hasEndDate, endDate }) {
  if (!String(name || "").trim()) return empty("Enter a name.");
  const amt = checkMoney(amount, POSITIVE);
  if (amt.problem) return amt.problem;
  if (!accountId) return empty("Choose an account.");
  const dueIssue = dateProblem(dueDate, { required: true });
  if (dueIssue) return dueIssue;
  if (recurring && hasEndDate) {
    const endIssue = dateProblem(endDate, { required: false });
    if (endIssue) return endIssue;
  }
  return ok({ amount: amt.value });
}

// `balanceInput` is "what you have" for assets and "what you owe" for credit/loan accounts.
export function checkAccountForm({ name, balanceInput, interestRateInput }) {
  if (!String(name || "").trim()) return empty("Enter a name.");
  const bal = checkMoney(balanceInput, ANY_SIGN);
  if (bal.problem) return bal.problem;
  let interestRate = null;
  if (String(interestRateInput ?? "").trim() !== "") {
    const rate = checkMoneyInput(interestRateInput, { min: 0, max: 1000 });
    if (rate.error) return invalid("Interest rate must be between 0 and 1000.");
    interestRate = rate.value;
  }
  return ok({ balance: bal.value, interestRate });
}

export function checkGoalForm({ name, targetAmount, trackingMode, accountId, manualAmount, targetDate }) {
  if (!String(name || "").trim()) return empty("Enter a name.");
  const target = checkMoney(targetAmount, POSITIVE);
  if (target.problem) return target.problem;
  if (trackingMode === "account" && !accountId) return empty("Choose an account to track.");
  let manual = 0;
  if (trackingMode === "manual" && String(manualAmount ?? "").trim() !== "") {
    const m = checkMoney(manualAmount, NON_NEGATIVE);
    if (m.problem) return m.problem;
    manual = m.value;
  }
  const dateIssue = dateProblem(targetDate, { required: false });
  if (dateIssue) return dateIssue;
  return ok({ targetAmount: target.value, manualAmount: manual });
}

// Category form: the monthly limit is optional (blank = no limit); income categories have none.
export function checkCategoryForm({ name, type, limit }) {
  if (!String(name || "").trim()) return empty("Enter a name.");
  let limitValue = 0;
  if (type === "expense" && String(limit ?? "").trim() !== "") {
    const l = checkMoney(limit, NON_NEGATIVE);
    if (l.problem) return invalid(`Monthly budget limit: ${l.problem.hint}`);
    limitValue = l.value;
  }
  return ok({ limit: limitValue });
}

// The quick "add amount saved" box on a manual goal card. Returns the amount to add, or null.
export function parseContribution(text) {
  const { value } = checkMoneyInput(text, POSITIVE);
  return value;
}

// Budget forms have many amount boxes. Blank is fine (means 0); anything typed must be a
// usable non-negative amount. Only the boxes that are actually used count: a category in
// "items" mode ignores its bulk amount, and an income row tracked by category ignores its
// typed amount, so stale text left in those hidden boxes can't block saving.
export function checkBudgetForm({ name, startDate, endDate, incomeItems, cats }) {
  if (!String(name || "").trim()) return empty("Enter a name.");
  for (const [label, value] of [["start", startDate], ["end", endDate]]) {
    const issue = dateProblem(value, { required: false });
    if (issue) return invalid(`The ${label} date isn't valid.`);
  }
  const blankOrMoney = (text) => (String(text ?? "").trim() === "" ? { value: 0 } : checkMoney(text, NON_NEGATIVE));
  for (const it of incomeItems || []) {
    if (it.mode === "category") continue;
    const r = blankOrMoney(it.amount);
    if (r.problem) return invalid(`Income "${(it.name || "Income").trim() || "Income"}": ${r.problem.hint}`);
  }
  for (const c of cats || []) {
    const label = (c.name || "").trim() || "Untitled category";
    if (c.mode === "items") {
      for (const i of c.items || []) {
        const r = blankOrMoney(i.amount);
        if (r.problem) return invalid(`${label} › ${(i.name || "").trim() || "Untitled expense"}: ${r.problem.hint}`);
        if (dateProblem(i.date, { required: false })) return invalid(`${label}: a due date isn't valid.`);
      }
    } else {
      const r = blankOrMoney(c.bulkAmount);
      if (r.problem) return invalid(`${label}: ${r.problem.hint}`);
    }
    if (dateProblem(c.date, { required: false })) return invalid(`${label}: the date isn't valid.`);
  }
  return ok();
}

// A budget amount field's value for saving: blank/invalid -> 0, otherwise rounded to cents.
// (checkBudgetForm has already rejected invalid text by the time anything is saved.)
export function moneyOrZero(text) {
  const { value } = checkMoneyInput(text, NON_NEGATIVE);
  return value ?? 0;
}

// Last line of defence in App.saveTransaction, for any caller that bypasses the form.
export function isSavableTransaction(t) {
  return !!t && isValidDateStr(t.date) && Number.isFinite(t.amount) && t.amount > 0 && Math.abs(t.amount) <= MAX_MONEY;
}
