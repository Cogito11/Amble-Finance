import { isWithinRolling30Days } from "../utils/dates";
import { uid } from "../utils/misc";

// Hand-curated (not evenly hue-rotated) so neighbors read as distinct colors
// rather than blending into a gradient - saturation/lightness vary per entry
// on purpose. Weighted toward reds/oranges/greens/teals/blues; purple/pink
// kept to a handful of calmer accents (indigo through rose below); "slate"
// and "sand" at the end are true desaturated neutrals, not another hue family.
export const CAT_PALETTE = [
  "#D2414D", "#DC7160", "#D07039", "#DE9E54", "#D4AB49", "#D6C066",
  "#C0C44F", "#A0C251", "#71B045", "#5DBF4A", "#3E984A", "#42A975",
  "#36A192", "#3DB7C2", "#3895BC", "#4A8AC9", "#587CD0", "#3E51CC",
  "#3F36BF", "#466B9B", "#6A4AB5", "#8D5BB9", "#AF67C1", "#C760A2",
  "#D06287", "#A84F38", "#6E9245", "#397F50", "#535C65", "#BCB19F",
];

// Small stable string hash (not cryptographic - just needs to spread names
// evenly across the palette) used to break ties deterministically instead
// of via Math.random(), so a given name always resolves the same way.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash;
}

// Picks a color for a new category from CAT_PALETTE, preferring colors that
// aren't already in use by an existing category so categories stay visually
// distinct for as long as possible (up to the palette size). Once every color
// is in use at least once, falls back to picking among the least-used colors,
// breaking ties by hashing the category's name so the same name reliably
// lands on the same color rather than jittering between reloads/edits.
export function nextCategoryColor(existingCategories, name) {
  const counts = new Map(CAT_PALETTE.map((c) => [c, 0]));
  // Sub-items (parentCategoryId set) deliberately inherit their parent's color
  // rather than picking their own, so they aren't a genuine additional "use"
  // of that color - only count top-level categories toward usage.
  for (const c of existingCategories || []) {
    if (c.parentCategoryId) continue;
    if (c.color && counts.has(c.color)) counts.set(c.color, counts.get(c.color) + 1);
  }
  const minCount = Math.min(...counts.values());
  const leastUsed = CAT_PALETTE.filter((c) => counts.get(c) === minCount);
  const hash = hashString(name || "");
  return leastUsed[hash % leastUsed.length];
}

// Reassigns every top-level category's color, shuffled to a fresh arrangement each
// time it's called - not just ones whose color happens to have fallen outside the
// palette (that almost never happens in practice, since categories always get
// their color from the palette to begin with). Unlike nextCategoryColor (used when
// a single new category is created, where a name-based hash keeps its color stable
// across reloads), this deliberately uses real randomness: it shuffles a working
// copy of CAT_PALETTE and hands the colors out in that shuffled order, so repeated
// clicks keep landing on a different layout instead of converging on one
// deterministic "balanced" result and going stale after the first click. Colors
// are still handed out round-robin through the shuffled palette, so usage stays
// even - it's the order that's randomized, not which colors get used how often.
// Sub-expenses always mirror their parent's color rather than choosing their own
// (see nextCategoryColor), so afterward every child is re-synced to its parent's
// freshly shuffled color.
// Returns the updated category list plus how many categories actually ended up
// with a different color than before (informational only - the caller doesn't
// need this to decide whether to apply the update).
export function refreshCategoryColors(categories) {
  let cats = (categories || []).map((c) => ({ ...c }));
  let changedCount = 0;

  const shuffled = [...CAT_PALETTE];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let nextIdx = 0;
  cats = cats.map((c) => {
    if (c.parentCategoryId) return c;
    const newColor = shuffled[nextIdx % shuffled.length];
    nextIdx++;
    if (newColor !== c.color) changedCount++;
    return { ...c, color: newColor };
  });

  const parentColorById = new Map(cats.filter((c) => !c.parentCategoryId).map((c) => [c.id, c.color]));
  cats = cats.map((c) => {
    if (!c.parentCategoryId) return c;
    const parentColor = parentColorById.get(c.parentCategoryId);
    if (!parentColor || c.color === parentColor) return c;
    changedCount++;
    return { ...c, color: parentColor };
  });

  return { categories: cats, changedCount };
}

// The general (unowned by any budget) starter categories - just the income
// categories. The rest of the starter expense categories live inside the
// seeded Default Budget below.
export function seedCategories() {
  const income = [["Salary", 0], ["Freelance", 0], ["Other Income", 0]];
  return income.map(([name], i) => ({
    id: uid(), name, limit: 0, type: "income", color: CAT_PALETTE[i % CAT_PALETTE.length],
  }));
}

export function budgetCategoryTotal(cat) {
  if (cat.mode === "items") return (cat.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return Number(cat.bulkAmount) || 0;
}

export function budgetAllocated(budget) {
  return (budget.categories || []).reduce((s, c) => s + budgetCategoryTotal(c), 0);
}

// A transaction counts toward category spend if it's a normal expense, or if it's a
// transfer that's been explicitly tagged with a category (e.g. moving money into a
// dedicated savings category). Uncategorized transfers never count as spend.
export function isSpendTx(t) {
  return t.type === "expense" || (t.type === "transfer" && !!t.categoryId);
}

// Spend for a category: if it belongs to a budget that has a time frame (a start
// and/or end date set), track every transaction ever assigned to it, all-time -
// gauges for a dated budget shouldn't reset just because the calendar month rolled
// over. If it belongs to a budget with no time frame, or isn't tied to a budget at
// all (a general category), scope it to a rolling 30-day window instead. Also rolls
// up spend from any sub-expense categories (itemized budget line items) so a parent
// category's total reflects money logged against its specific expenses too.
//
// Note: the field linking a category to its budget is still called `planId` on the
// data itself (not renamed, to avoid a data-migration for saved files/backups) -
// only the code-facing names below (`budgets`, `ownerBudget`, etc.) use "budget".
export function categorySpend(category, transactions, budgets, categories) {
  const ownerBudget = category.planId ? (budgets || []).find((b) => b.id === category.planId) : null;
  const childIds = (categories || []).filter((c) => c.parentCategoryId === category.id).map((c) => c.id);
  const idSet = new Set([category.id, ...childIds]);
  let txs = transactions.filter((t) => isSpendTx(t) && idSet.has(t.categoryId));
  const hasTimeFrame = !!(ownerBudget && (ownerBudget.startDate || ownerBudget.endDate));
  if (!hasTimeFrame) txs = txs.filter((t) => isWithinRolling30Days(t.date));
  return txs.reduce((s, t) => s + t.amount, 0);
}

// A transaction counts toward income-category tracking if it's a normal income
// transaction, or a transfer that's been explicitly tagged with that category
// (e.g. an incoming transfer that represents a paycheck deposit). Mirrors
// isSpendTx on the expense side.
export function isIncomeTx(t) {
  return t.type === "income" || (t.type === "transfer" && !!t.categoryId);
}

// Live total tracked for an income category: same time-frame rule as
// categorySpend (all-time for a category owned by a budget with a start/end
// date, otherwise a rolling 30 days) - so a budget-scoped income entry's
// total automatically covers its whole time frame, while a general income
// category behaves like a rolling monthly figure.
export function categoryIncome(category, transactions, budgets, categories) {
  const ownerBudget = category.planId ? (budgets || []).find((b) => b.id === category.planId) : null;
  let txs = transactions.filter((t) => isIncomeTx(t) && t.categoryId === category.id);
  const hasTimeFrame = !!(ownerBudget && (ownerBudget.startDate || ownerBudget.endDate));
  if (!hasTimeFrame) txs = txs.filter((t) => isWithinRolling30Days(t.date));
  return txs.reduce((s, t) => s + t.amount, 0);
}

// Mirrors a budget's categories into the app-wide category list so they can be
// assigned to real transactions. Keeps existing links, creates new categories
// for new budget categories, and deletes ones removed from the budget (their ids
// are returned in removedCategoryIds so callers can also clear that categoryId
// off any transactions that referenced it).
// Itemized categories also mirror each line item as its own sub-category (linked via
// parentCategoryId) so a specific expense, like "Netflix" under "Subscriptions", can be
// selected directly on a transaction.
//
// `budget.id` still gets written into each mirrored category's `planId` field (not
// renamed - see the note on categorySpend above).
export function syncBudgetCategories(budget, categories) {
  let cats = categories.slice();
  const keepIds = new Set();
  const newBudgetCats = (budget.categories || []).map((pc) => {
    const total = budgetCategoryTotal(pc);
    const existingIdx = pc.categoryId ? cats.findIndex((c) => c.id === pc.categoryId) : -1;
    let parentId, parentColor;
    if (existingIdx >= 0) {
      parentId = pc.categoryId;
      parentColor = pc.color || cats[existingIdx].color;
      cats[existingIdx] = { ...cats[existingIdx], name: pc.name, limit: total, planId: budget.id, type: "expense", parentCategoryId: null, date: pc.date || null, color: parentColor };
      keepIds.add(parentId);
    } else {
      parentId = uid();
      parentColor = pc.color || nextCategoryColor(cats, pc.name);
      cats.push({
        id: parentId, name: pc.name, type: "expense", limit: total,
        color: parentColor, planId: budget.id, parentCategoryId: null, date: pc.date || null,
      });
      keepIds.add(parentId);
    }

    let newItems = pc.items;
    if (pc.mode === "items") {
      newItems = (pc.items || []).map((it) => {
        const itAmount = Number(it.amount) || 0;
        const existingItemIdx = it.categoryId ? cats.findIndex((c) => c.id === it.categoryId) : -1;
        if (existingItemIdx >= 0) {
          cats[existingItemIdx] = { ...cats[existingItemIdx], name: it.name, limit: itAmount, planId: budget.id, type: "expense", parentCategoryId: parentId, date: it.date || null };
          keepIds.add(it.categoryId);
          return it;
        }
        const newItemId = uid();
        cats.push({
          id: newItemId, name: it.name, type: "expense", limit: itAmount,
          color: parentColor, planId: budget.id, parentCategoryId: parentId, date: it.date || null,
        });
        keepIds.add(newItemId);
        return { ...it, categoryId: newItemId };
      });
    }

    return { ...pc, categoryId: parentId, items: newItems };
  });

  // Income entries set to "track by category" get the exact same mirroring
  // treatment as expense categories above - just simpler, since income
  // entries don't have sub-items. Sharing `keepIds` with the expense loop
  // means a single removedCategoryIds pass below cleanly covers both.
  const newIncomeItems = (budget.incomeItems || []).map((it) => {
    if (it.mode !== "category") return it;
    const existingIdx = it.categoryId ? cats.findIndex((c) => c.id === it.categoryId) : -1;
    let categoryId;
    if (existingIdx >= 0) {
      categoryId = it.categoryId;
      cats[existingIdx] = { ...cats[existingIdx], name: it.name, type: "income", planId: budget.id, parentCategoryId: null };
      keepIds.add(categoryId);
    } else {
      categoryId = uid();
      cats.push({
        id: categoryId, name: it.name, type: "income", limit: 0,
        color: nextCategoryColor(cats, it.name), planId: budget.id, parentCategoryId: null,
      });
      keepIds.add(categoryId);
    }
    return { ...it, categoryId };
  });

  const removedCategoryIds = cats
    .filter((c) => c.planId === budget.id && !keepIds.has(c.id))
    .map((c) => c.id);
  cats = cats.filter((c) => !(c.planId === budget.id && !keepIds.has(c.id)));
  return { categories: cats, budget: { ...budget, categories: newBudgetCats, incomeItems: newIncomeItems }, removedCategoryIds };
}

// Applies the removedCategoryIds from syncBudgetCategories to a transactions list,
// clearing categoryId on any transaction that pointed at a category which no
// longer exists so it falls back to "uncategorized" instead of dangling.
export function clearRemovedCategoryRefs(transactions, removedCategoryIds) {
  if (!removedCategoryIds || !removedCategoryIds.length) return transactions;
  const removedSet = new Set(removedCategoryIds);
  return transactions.map((t) => (removedSet.has(t.categoryId) ? { ...t, categoryId: null } : t));
}
