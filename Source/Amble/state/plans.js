import { clearRemovedCategoryRefs, seedCategories, syncPlanCategories } from "./categories";
import { addMonthsClamped, currentMonthRange, toLocalDateStr, todayStr } from "../utils/dates";
import { uid } from "../utils/misc";

export const DEFAULT_BUDGET_CATEGORIES = [
  ["Groceries", 500], ["Dining Out", 200], ["Transportation", 200],
  ["Utilities", 250], ["Housing", 1500], ["Entertainment", 100],
  ["Shopping", 150], ["Health", 100], ["Subscriptions", 50],
];

// A starter budget so a fresh install isn't empty - scoped to the current month and
// set to repeat monthly, so it keeps rolling forward on its own via rolloverDuePlans.
export function seedDefaultBudgetPlan() {
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
  const synced = syncPlanCategories(seedDefaultBudgetPlan(), generalCategories);
  return {
    accounts: [], categories: synced.categories, transactions: [], plans: [synced.plan],
    currency: "USD", lastBackupAt: null,
  };
}

export const REPEAT_LABELS = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", match: "Match time frame" };

export const REPEAT_DUE_PHRASES = { weekly: "a week after", biweekly: "2 weeks after", monthly: "a month after" };

// How long (in days) a plan's own time frame spans. Used both to show a preview
// in the Edit budget menu and, below, to size every repeated cycle so it always
// matches the length of the budget it's replacing - regardless of which repeat
// frequency was picked.
export function planMatchDurationDays(plan) {
  if (!plan.startDate || !plan.endDate) return null;
  const start = new Date(plan.startDate + "T00:00:00");
  const end = new Date(plan.endDate + "T00:00:00");
  return Math.max(1, Math.round((end - start) / 86400000));
}

// The date a repeating plan becomes due to generate its next cycle. "Match time
// frame" waits for the plan's own end date - its length is effectively the
// repeat interval. The fixed-interval frequencies (weekly/biweekly/monthly)
// instead count forward from the plan's start date, so a budget set to repeat
// weekly becomes due a week after it started, 2 weeks becomes due two weeks
// after it started, and so on - independent of how long the budget itself runs.
export function planDueDate(plan) {
  if (!plan.startDate || !plan.endDate) return null;
  const freq = plan.repeat && plan.repeat.frequency;
  if (freq === "match") return plan.endDate;
  if (freq === "weekly") {
    const due = new Date(plan.startDate + "T00:00:00");
    due.setDate(due.getDate() + 7);
    return toLocalDateStr(due);
  }
  if (freq === "biweekly") {
    const due = new Date(plan.startDate + "T00:00:00");
    due.setDate(due.getDate() + 14);
    return toLocalDateStr(due);
  }
  if (freq === "monthly") {
    // Prefer the anchor day stored on the plan the first time repeating was set
    // up, so it survives every later cycle even if an in-between cycle had to
    // clamp down to a shorter month. Only falls back to the current startDate's
    // day for plans saved before anchorDay existed.
    const anchorDay = (plan.repeat && plan.repeat.anchorDay) || new Date(plan.startDate + "T00:00:00").getDate();
    return addMonthsClamped(plan.startDate, 1, anchorDay);
  }
  return null;
}

// Computes the next cycle's start/end dates. The cycle it produces always
// keeps the exact same length as the budget being repeated, but *when* it
// starts depends on the repeat frequency (see planDueDate): "Match time
// frame" chains continuously off the current end date (no gap, no overlap),
// while the fixed-interval frequencies (weekly/biweekly/monthly) anchor the
// new cycle's start to the due date itself - a fixed interval after the
// current cycle's *start* date, not after wherever its end date happens to
// fall. That's what makes a 2-week budget repeating monthly actually start a
// month after its start date, rather than the day its old cycle ends.
export function nextPlanDates(plan) {
  const durationDays = planMatchDurationDays(plan);
  if (!durationDays) return null;
  const freq = plan.repeat && plan.repeat.frequency;
  let start;
  if (freq === "match") {
    start = new Date(plan.endDate + "T00:00:00");
    start.setDate(start.getDate() + 1);
  } else {
    const due = planDueDate(plan);
    if (!due) return null;
    start = new Date(due + "T00:00:00");
  }
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

// Rolls forward any active, repeat-enabled plans that have become due (see planDueDate),
// duplicating each into a fresh plan/cycle (with its own categories) so historical data
// stays intact.
export function rolloverDuePlans(state) {
  const today = todayStr();
  let categories = state.categories.slice();
  let plans = state.plans.slice();
  let transactions = state.transactions.slice();
  let mutated = false;
  let lastActivatedId = null;

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    // Repeat fires regardless of whether the plan is currently active or inactive -
    // this lets two alternating budgets (e.g. 1st & 15th paycheck) each repeat on
    // their own schedule even while sitting inactive waiting their turn.
    if (!(p.repeat && p.repeat.enabled && p.startDate && p.endDate)) continue;

    let cur = p;
    let lastNew = null;
    let iterations = 0;
    let due = planDueDate(cur);
    while (due && due < today && iterations < 104) {
      const dates = nextPlanDates(cur);
      if (!dates) break;
      iterations++;
      lastNew = {
        id: uid(),
        // Strip any trailing " Repeated" from the source name first so cycles
        // that repeat many times over don't stack into "X Repeated Repeated Repeated".
        name: `${p.name.replace(/ Repeated$/i, "")} Repeated`,
        startDate: dates.startDate,
        endDate: dates.endDate,
        income: p.income,
        incomeItems: (p.incomeItems || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount })),
        dateCreated: today,
        // Guarantees the repeated budget lands at the top of the Plans list,
        // same as any other newly created plan (see nextTopPlanOrder).
        order: nextTopPlanOrder(plans),
        active: true,
        repeat: { ...p.repeat },
        categories: (p.categories || []).map((c) => ({
          id: uid(), name: c.name, mode: c.mode, bulkAmount: c.bulkAmount, date: c.date || null,
          items: (c.items || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount, date: it.date || null })),
        })),
      };
      cur = lastNew;
      due = planDueDate(cur);
    }
    if (lastNew) {
      mutated = true;
      // The old plan goes inactive AND has repeat turned off, so it fires exactly
      // once per user-configured repeat setup. The new plan (pushed below) is the
      // one that stays active with repeat still on, ready for its own next cycle.
      plans[i] = { ...p, active: false, repeat: { ...p.repeat, enabled: false } };
      const synced = syncPlanCategories(lastNew, categories);
      categories = synced.categories;
      plans.push(synced.plan);
      lastActivatedId = synced.plan.id;
      transactions = clearRemovedCategoryRefs(transactions, synced.removedCategoryIds);
    }
  }

  // Only one budget can be active at a time - same rule setActivePlan/savePlan
  // enforce everywhere else. Without this, a repeat firing while some unrelated
  // budget was already active would leave both marked active.
  if (lastActivatedId) {
    plans = plans.map((p) => (p.id === lastActivatedId ? p : { ...p, active: false }));
  }

  return mutated ? { ...state, plans, categories, transactions } : state;
}

// One-time upgrade path for plans saved before the `order` field existed.
// Assigns order values based on their old implicit ordering (by dateCreated,
// newest first) so upgrading doesn't visibly reshuffle anyone's list. Once
// every plan has an explicit order this is a no-op - it's a migration step,
// not a second ranking system running alongside `order`.
export function migratePlanOrder(plans) {
  if (plans.every((p) => typeof p.order === "number")) return plans;
  const legacyOrder = [...plans].sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""));
  const orderById = new Map(legacyOrder.map((p, i) => [p.id, i]));
  return plans.map((p) => (typeof p.order === "number" ? p : { ...p, order: orderById.get(p.id) }));
}

// Determines the order budgets appear in on the Plans list. Every plan carries
// an explicit numeric `order` (lower = higher up the list). This is the single
// source of truth for list position - nothing else influences it. New plans
// are assigned an order below the current minimum (see nextTopPlanOrder) so
// they land at the top, and reorderPlan renumbers everyone sequentially
// whenever the user moves one manually.
export function sortedPlansList(plans) {
  return [...plans].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// An order value guaranteed to sort above every plan currently in the list -
// used whenever a plan is created (new, duplicated, or repeated) so it always
// lands at the top, without needing any other tiebreak logic.
export function nextTopPlanOrder(plans) {
  if (!plans.length) return 0;
  return Math.min(...plans.map((p) => (typeof p.order === "number" ? p.order : 0))) - 1;
}
