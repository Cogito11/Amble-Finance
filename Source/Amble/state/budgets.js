import { categoryIncome, clearRemovedCategoryRefs, seedCategories, syncBudgetCategories } from "./categories";
import { addMonthsClamped, currentMonthRange, toLocalDateStr, todayStr } from "../utils/dates";
import { uid } from "../utils/misc";

export const DEFAULT_BUDGET_CATEGORIES = [
  ["Groceries", 500], ["Dining Out", 200], ["Transportation", 200],
  ["Utilities", 250], ["Housing", 1500], ["Entertainment", 100],
  ["Shopping", 150], ["Health", 100], ["Subscriptions", 50],
];

// A starter budget so a fresh install isn't empty - scoped to the current month and
// set to repeat monthly, so it keeps rolling forward on its own via rolloverDueBudgets.
export function seedDefaultBudget() {
  const { startDate, endDate } = currentMonthRange();
  return {
    id: uid(),
    name: "Default Budget",
    startDate,
    endDate,
    income: DEFAULT_BUDGET_CATEGORIES.reduce((s, [, limit]) => s + limit, 0),
    dateCreated: todayStr(),
    order: 0,
    active: true,
    repeat: { enabled: true, frequency: "monthly" },
    categories: DEFAULT_BUDGET_CATEGORIES.map(([name, limit]) => ({
      id: uid(), name, mode: "bulk", bulkAmount: limit, date: null, items: [],
    })),
  };
}

export function defaultState() {
  const generalCategories = seedCategories();
  const synced = syncBudgetCategories(seedDefaultBudget(), generalCategories);
  return {
    accounts: [], categories: synced.categories, transactions: [], plans: [synced.budget],
    currency: "USD", lastBackupAt: null,
  };
}

// Total income for a budget: sums each manual entry's typed amount, plus - for
// any entry set to track by category - its live category total (money
// actually logged against that category so far, via categoryIncome). This is
// why income entries can't just be re-summed once at save time: a
// category-tracked entry's contribution changes on its own as new income
// transactions come in, the same way a category's "spent" figure does on the
// expense side. Falls back to the plain `income` number for budgets saved
// before incomeItems existed.
export function budgetIncomeTotal(budget, transactions, budgets, categories) {
  const items = budget.incomeItems;
  if (!items || !items.length) return Number(budget.income) || 0;
  return items.reduce((sum, it) => {
    if (it.mode === "category") {
      const cat = it.categoryId ? (categories || []).find((c) => c.id === it.categoryId) : null;
      return sum + (cat ? categoryIncome(cat, transactions, budgets, categories) : 0);
    }
    return sum + (Number(it.amount) || 0);
  }, 0);
}

export const REPEAT_LABELS = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", match: "Match time frame" };

export const REPEAT_DUE_PHRASES = { weekly: "a week after", biweekly: "2 weeks after", monthly: "a month after" };

// How long (in days) a budget's own time frame spans. Used both to show a preview
// in the Edit budget menu and, below, to size every repeated cycle so it always
// matches the length of the budget it's replacing - regardless of which repeat
// frequency was picked.
export function budgetMatchDurationDays(budget) {
  if (!budget.startDate || !budget.endDate) return null;
  const start = new Date(budget.startDate + "T00:00:00");
  const end = new Date(budget.endDate + "T00:00:00");
  return Math.max(1, Math.round((end - start) / 86400000));
}

// The date a repeating budget becomes due to generate its next cycle. "Match time
// frame" waits for the budget's own end date - its length is effectively the
// repeat interval. The fixed-interval frequencies (weekly/biweekly/monthly)
// instead count forward from the budget's start date, so a budget set to repeat
// weekly becomes due a week after it started, 2 weeks becomes due two weeks
// after it started, and so on - independent of how long the budget itself runs.
export function budgetDueDate(budget) {
  if (!budget.startDate || !budget.endDate) return null;
  const freq = budget.repeat && budget.repeat.frequency;
  if (freq === "match") return budget.endDate;
  if (freq === "weekly") {
    const due = new Date(budget.startDate + "T00:00:00");
    due.setDate(due.getDate() + 7);
    return toLocalDateStr(due);
  }
  if (freq === "biweekly") {
    const due = new Date(budget.startDate + "T00:00:00");
    due.setDate(due.getDate() + 14);
    return toLocalDateStr(due);
  }
  if (freq === "monthly") {
    // Prefer the anchor day stored on the budget being edited the first time repeating
    // was set up, so it survives every later cycle even if an in-between cycle had to
    // clamp down to a shorter month. Only falls back to the current startDate's
    // day for budgets saved before anchorDay existed.
    const anchorDay = (budget.repeat && budget.repeat.anchorDay) || new Date(budget.startDate + "T00:00:00").getDate();
    return addMonthsClamped(budget.startDate, 1, anchorDay);
  }
  return null;
}

// Computes the next cycle's start/end dates. The cycle it produces always
// keeps the exact same length as the budget being repeated, but *when* it
// starts depends on the repeat frequency (see budgetDueDate): "Match time
// frame" chains continuously off the current end date (no gap, no overlap),
// while the fixed-interval frequencies (weekly/biweekly/monthly) anchor the
// new cycle's start to the due date itself - a fixed interval after the
// current cycle's *start* date, not after wherever its end date happens to
// fall. That's what makes a 2-week budget repeating monthly actually start a
// month after its start date, rather than the day its old cycle ends.
export function nextBudgetDates(budget) {
  const durationDays = budgetMatchDurationDays(budget);
  if (!durationDays) return null;
  const freq = budget.repeat && budget.repeat.frequency;
  let start;
  if (freq === "match") {
    start = new Date(budget.endDate + "T00:00:00");
    start.setDate(start.getDate() + 1);
  } else {
    const due = budgetDueDate(budget);
    if (!due) return null;
    start = new Date(due + "T00:00:00");
  }
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

// Rolls forward any active, repeat-enabled budgets that have become due (see
// budgetDueDate), duplicating each into a fresh budget/cycle (with its own
// categories) so historical data stays intact.
export function rolloverDueBudgets(state) {
  const today = todayStr();
  let categories = state.categories.slice();
  let budgets = state.plans.slice();
  let transactions = state.transactions.slice();
  let mutated = false;
  let lastActivatedId = null;

  for (let i = 0; i < budgets.length; i++) {
    const b = budgets[i];
    // Repeat fires regardless of whether the budget is currently active or inactive -
    // this lets two alternating budgets (e.g. 1st & 15th paycheck) each repeat on
    // their own schedule even while sitting inactive waiting their turn.
    if (!(b.repeat && b.repeat.enabled && b.startDate && b.endDate)) continue;

    let cur = b;
    let lastNew = null;
    let iterations = 0;
    let due = budgetDueDate(cur);
    while (due && due < today && iterations < 104) {
      const dates = nextBudgetDates(cur);
      if (!dates) break;
      iterations++;
      lastNew = {
        id: uid(),
        // Strip any trailing " Repeated" from the source name first so cycles
        // that repeat many times over don't stack into "X Repeated Repeated Repeated".
        name: `${b.name.replace(/ Repeated$/i, "")} Repeated`,
        startDate: dates.startDate,
        endDate: dates.endDate,
        income: b.income,
        incomeItems: (b.incomeItems || []).map((it) => ({ id: uid(), name: it.name, mode: it.mode === "category" ? "category" : "manual", amount: it.amount })),
        dateCreated: today,
        // Guarantees the repeated budget lands at the top of the Budgets list,
        // same as any other newly created budget (see nextTopBudgetOrder).
        order: nextTopBudgetOrder(budgets),
        active: true,
        repeat: { ...b.repeat },
        categories: (b.categories || []).map((c) => ({
          id: uid(), name: c.name, mode: c.mode, bulkAmount: c.bulkAmount, date: c.date || null,
          items: (c.items || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount, date: it.date || null })),
        })),
      };
      cur = lastNew;
      due = budgetDueDate(cur);
    }
    if (lastNew) {
      mutated = true;
      // The old budget goes inactive AND has repeat turned off, so it fires exactly
      // once per user-configured repeat setup. The new budget (pushed below) is the
      // one that stays active with repeat still on, ready for its own next cycle.
      budgets[i] = { ...b, active: false, repeat: { ...b.repeat, enabled: false } };
      const synced = syncBudgetCategories(lastNew, categories);
      categories = synced.categories;
      budgets.push(synced.budget);
      lastActivatedId = synced.budget.id;
      transactions = clearRemovedCategoryRefs(transactions, synced.removedCategoryIds);
    }
  }

  // Only one budget can be active at a time - same rule setActiveBudget/saveBudget
  // enforce everywhere else. Without this, a repeat firing while some unrelated
  // budget was already active would leave both marked active.
  if (lastActivatedId) {
    budgets = budgets.map((b) => (b.id === lastActivatedId ? b : { ...b, active: false }));
  }

  return mutated ? { ...state, plans: budgets, categories, transactions } : state;
}

// One-time upgrade path for budgets saved before the `order` field existed.
// Assigns order values based on their old implicit ordering (by dateCreated,
// newest first) so upgrading doesn't visibly reshuffle anyone's list. Once
// every budget has an explicit order this is a no-op - it's a migration step,
// not a second ranking system running alongside `order`.
export function migrateBudgetOrder(budgets) {
  if (budgets.every((b) => typeof b.order === "number")) return budgets;
  const legacyOrder = [...budgets].sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""));
  const orderById = new Map(legacyOrder.map((b, i) => [b.id, i]));
  return budgets.map((b) => (typeof b.order === "number" ? b : { ...b, order: orderById.get(b.id) }));
}

// Determines the order budgets appear in on the Budgets list. Every budget carries
// an explicit numeric `order` (lower = higher up the list). This is the single
// source of truth for list position - nothing else influences it. New budgets
// are assigned an order below the current minimum (see nextTopBudgetOrder) so
// they land at the top, and reorderBudget renumbers everyone sequentially
// whenever the user moves one manually.
export function sortedBudgetsList(budgets) {
  return [...budgets].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// An order value guaranteed to sort above every budget currently in the list -
// used whenever a budget is created (new, duplicated, or repeated) so it always
// lands at the top, without needing any other tiebreak logic.
export function nextTopBudgetOrder(budgets) {
  if (!budgets.length) return 0;
  return Math.min(...budgets.map((b) => (typeof b.order === "number" ? b.order : 0))) - 1;
}
