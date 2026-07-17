import { isWithinRolling30Days } from "../utils/dates";
import { uid } from "../utils/misc";

export const CAT_PALETTE = [
  "#C9A24B", "#3E8E7E", "#8B6F47", "#6B8E9F", "#B0463C",
  "#7A6A8A", "#A3763F", "#4F7C6B", "#9C7B4F", "#6E5B4A",
];

// The general (unowned by any budget) starter categories - just the income
// categories. The rest of the starter expense categories live inside the
// seeded Default Budget below.
export function seedCategories() {
  const income = [["Salary", 0], ["Freelance", 0], ["Other Income", 0]];
  return income.map(([name], i) => ({
    id: uid(), name, limit: 0, type: "income", color: CAT_PALETTE[i % CAT_PALETTE.length],
  }));
}

export function planCategoryTotal(cat) {
  if (cat.mode === "items") return (cat.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return Number(cat.bulkAmount) || 0;
}

export function planAllocated(plan) {
  return (plan.categories || []).reduce((s, c) => s + planCategoryTotal(c), 0);
}

// A transaction counts toward category spend if it's a normal expense, or if it's a
// transfer that's been explicitly tagged with a category (e.g. moving money into a
// dedicated savings category). Uncategorized transfers never count as spend.
export function isSpendTx(t) {
  return t.type === "expense" || (t.type === "transfer" && !!t.categoryId);
}

// Spend for a category: if it belongs to a plan that has a time frame (a start
// and/or end date set), track every transaction ever assigned to it, all-time -
// gauges for a dated budget shouldn't reset just because the calendar month rolled
// over. If it belongs to a plan with no time frame, or isn't tied to a plan at all
// (a general category), scope it to a rolling 30-day window instead. Also rolls up
// spend from any sub-expense categories (itemized plan line items) so a parent
// category's total reflects money logged against its specific expenses too.
export function categorySpend(category, transactions, plans, categories) {
  const ownerPlan = category.planId ? (plans || []).find((p) => p.id === category.planId) : null;
  const childIds = (categories || []).filter((c) => c.parentCategoryId === category.id).map((c) => c.id);
  const idSet = new Set([category.id, ...childIds]);
  let txs = transactions.filter((t) => isSpendTx(t) && idSet.has(t.categoryId));
  const hasTimeFrame = !!(ownerPlan && (ownerPlan.startDate || ownerPlan.endDate));
  if (!hasTimeFrame) txs = txs.filter((t) => isWithinRolling30Days(t.date));
  return txs.reduce((s, t) => s + t.amount, 0);
}

// Mirrors a plan's categories into the app-wide category list so they can be
// assigned to real transactions. Keeps existing links, creates new categories
// for new plan categories, and deletes ones removed from the plan (their ids are
// returned in removedCategoryIds so callers can also clear that categoryId off
// any transactions that referenced it).
// Itemized categories also mirror each line item as its own sub-category (linked via
// parentCategoryId) so a specific expense, like "Netflix" under "Subscriptions", can be
// selected directly on a transaction.
export function syncPlanCategories(plan, categories) {
  let cats = categories.slice();
  const keepIds = new Set();
  const newPlanCats = (plan.categories || []).map((pc) => {
    const total = planCategoryTotal(pc);
    const existingIdx = pc.categoryId ? cats.findIndex((c) => c.id === pc.categoryId) : -1;
    let parentId, parentColor;
    if (existingIdx >= 0) {
      parentId = pc.categoryId;
      parentColor = cats[existingIdx].color;
      cats[existingIdx] = { ...cats[existingIdx], name: pc.name, limit: total, planId: plan.id, type: "expense", parentCategoryId: null, date: pc.date || null };
      keepIds.add(parentId);
    } else {
      parentId = uid();
      parentColor = CAT_PALETTE[Math.floor(Math.random() * CAT_PALETTE.length)];
      cats.push({
        id: parentId, name: pc.name, type: "expense", limit: total,
        color: parentColor, planId: plan.id, parentCategoryId: null, date: pc.date || null,
      });
      keepIds.add(parentId);
    }

    let newItems = pc.items;
    if (pc.mode === "items") {
      newItems = (pc.items || []).map((it) => {
        const itAmount = Number(it.amount) || 0;
        const existingItemIdx = it.categoryId ? cats.findIndex((c) => c.id === it.categoryId) : -1;
        if (existingItemIdx >= 0) {
          cats[existingItemIdx] = { ...cats[existingItemIdx], name: it.name, limit: itAmount, planId: plan.id, type: "expense", parentCategoryId: parentId, date: it.date || null };
          keepIds.add(it.categoryId);
          return it;
        }
        const newItemId = uid();
        cats.push({
          id: newItemId, name: it.name, type: "expense", limit: itAmount,
          color: parentColor, planId: plan.id, parentCategoryId: parentId, date: it.date || null,
        });
        keepIds.add(newItemId);
        return { ...it, categoryId: newItemId };
      });
    }

    return { ...pc, categoryId: parentId, items: newItems };
  });
  const removedCategoryIds = cats
    .filter((c) => c.planId === plan.id && !keepIds.has(c.id))
    .map((c) => c.id);
  cats = cats.filter((c) => !(c.planId === plan.id && !keepIds.has(c.id)));
  return { categories: cats, plan: { ...plan, categories: newPlanCats }, removedCategoryIds };
}

// Applies the removedCategoryIds from syncPlanCategories to a transactions list,
// clearing categoryId on any transaction that pointed at a category which no
// longer exists so it falls back to "uncategorized" instead of dangling.
export function clearRemovedCategoryRefs(transactions, removedCategoryIds) {
  if (!removedCategoryIds || !removedCategoryIds.length) return transactions;
  const removedSet = new Set(removedCategoryIds);
  return transactions.map((t) => (removedSet.has(t.categoryId) ? { ...t, categoryId: null } : t));
}
