import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBillEdit, billCategorySnapshot, resolveBillCategoryId } from "../Amble/state/planning";
import { defaultState, rolloverDueBudgets } from "../Amble/state/budgets";
import { syncBudgetCategories } from "../Amble/state/categories";

// A synced budget: returns { budget, categories } where categories = general ones + this budget's.
function budgetWith(id, planCats, baseCategories = [], extra = {}) {
  const plan = { ...defaultState().plans[0], id, name: `Budget ${id}`, active: false, categories: planCats, income: 0, incomeItems: [], ...extra };
  const synced = syncBudgetCategories(plan, baseCategories);
  return { budget: synced.budget, categories: synced.categories };
}
const bulk = (name, amount = 100) => ({ id: `pc-${name}`, name, mode: "bulk", bulkAmount: amount, date: null, items: [] });
const items = (name, ...itemNames) => ({ id: `pc-${name}`, name, mode: "items", bulkAmount: 0, date: null, items: itemNames.map((n) => ({ id: `it-${n}`, name: n, amount: 10, date: null })) });
const catNamed = (categories, name, planId) => categories.find((c) => c.name === name && (planId === undefined || c.planId === planId));
const bill = (over = {}) => ({ id: "b", name: "Water", type: "expense", amount: 50, categoryId: null, ...over });

describe("billCategorySnapshot", () => {
  it("records name (and parent) only for budget-owned categories", () => {
    const { categories } = budgetWith("A", [bulk("Groceries"), items("Subscriptions", "Netflix")]);
    expect(billCategorySnapshot(catNamed(categories, "Groceries").id, categories)).toEqual({ categoryName: "Groceries", categoryParentName: null });
    expect(billCategorySnapshot(catNamed(categories, "Netflix").id, categories)).toEqual({ categoryName: "Netflix", categoryParentName: "Subscriptions" });
  });
  it("records nothing for general categories, missing ids, or no category", () => {
    const base = defaultState().categories.filter((c) => !c.planId);
    const general = base[0];
    expect(billCategorySnapshot(general.id, base)).toEqual({ categoryName: null, categoryParentName: null });
    expect(billCategorySnapshot("nope", base)).toEqual({ categoryName: null, categoryParentName: null });
    expect(billCategorySnapshot(null, base)).toEqual({ categoryName: null, categoryParentName: null });
  });
});

describe("resolveBillCategoryId", () => {
  it("keeps a general category as is (its id never changes)", () => {
    const base = defaultState().categories.filter((c) => !c.planId);
    const { categories } = budgetWith("B", [bulk("Groceries")], base);
    expect(resolveBillCategoryId(bill({ categoryId: base[0].id }), categories, "B")).toBe(base[0].id);
    expect(resolveBillCategoryId(bill({ categoryId: base[0].id }), categories, null)).toBe(base[0].id);
  });

  it("keeps a category that already belongs to the active budget", () => {
    const { categories } = budgetWith("B", [bulk("Groceries")]);
    const g = catNamed(categories, "Groceries", "B");
    expect(resolveBillCategoryId(bill({ categoryId: g.id }), categories, "B")).toBe(g.id);
  });

  it("follows the name into the active budget after a real rollover (the reported problem)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00"));
    const oct = budgetWith("oct", [bulk("Groceries", 400), bulk("Dining Out", 150)], [], {
      active: true, startDate: "2026-10-01", endDate: "2026-10-31", repeat: { enabled: true, frequency: "monthly" },
    });
    const octGroceries = catNamed(oct.categories, "Groceries", "oct");
    const state = { ...defaultState(), plans: [oct.budget], categories: oct.categories, transactions: [], bills: [bill({ categoryId: octGroceries.id })] };

    const after = rolloverDueBudgets(state);
    const active = after.plans.find((b) => b.active);
    expect(active.id).not.toBe("oct");
    const novGroceries = catNamed(after.categories, "Groceries", active.id);
    expect(novGroceries).toBeTruthy();
    expect(novGroceries.id).not.toBe(octGroceries.id); // new record, new id - this is why bills went stale

    // The bill itself still points at October's record...
    expect(after.bills[0].categoryId).toBe(octGroceries.id);
    // ...but a transaction created from it today is filed under November's Groceries.
    expect(resolveBillCategoryId(after.bills[0], after.categories, active.id)).toBe(novGroceries.id);
  });

  it("matches names ignoring case and surrounding spaces", () => {
    const old = budgetWith("A", [bulk("Groceries")]);
    const cur = budgetWith("B", [bulk("  groceries ")], old.categories);
    expect(resolveBillCategoryId(bill({ categoryId: catNamed(old.categories, "Groceries", "A").id }), cur.categories, "B"))
      .toBe(cur.categories.find((c) => c.planId === "B").id);
  });

  it("is uncategorized (null) when the active budget has no category by that name", () => {
    const old = budgetWith("A", [bulk("Groceries"), bulk("Gym")]);
    const cur = budgetWith("B", [bulk("Groceries")], old.categories);
    expect(resolveBillCategoryId(bill({ categoryId: catNamed(old.categories, "Gym", "A").id }), cur.categories, "B")).toBeNull();
  });

  it("is uncategorized for a budget-owned category when no budget is active", () => {
    const { categories } = budgetWith("A", [bulk("Groceries")]);
    expect(resolveBillCategoryId(bill({ categoryId: catNamed(categories, "Groceries", "A").id }), categories, undefined)).toBeNull();
  });

  it("still resolves by the remembered name after the old budget was deleted", () => {
    const old = budgetWith("A", [bulk("Groceries")]);
    const snapshot = billCategorySnapshot(catNamed(old.categories, "Groceries", "A").id, old.categories);
    const cur = budgetWith("B", [bulk("Groceries")]); // old categories gone entirely
    const orphan = bill({ categoryId: "deleted-id", ...snapshot });
    expect(resolveBillCategoryId(orphan, cur.categories, "B")).toBe(catNamed(cur.categories, "Groceries", "B").id);
  });

  it("a dangling id with no remembered name (older data) is uncategorized, not an error", () => {
    const cur = budgetWith("B", [bulk("Groceries")]);
    expect(resolveBillCategoryId(bill({ categoryId: "deleted-id" }), cur.categories, "B")).toBeNull();
  });

  it("itemized expenses prefer the same parent, and fall back to the same name elsewhere", () => {
    const old = budgetWith("A", [items("Subscriptions", "Netflix")]);
    const oldNetflix = catNamed(old.categories, "Netflix", "A");
    const sameParent = budgetWith("B", [items("Entertainment", "Netflix"), items("Subscriptions", "Netflix")], old.categories);
    const wanted = sameParent.categories.find((c) => c.name === "Netflix" && c.planId === "B" && sameParent.categories.find((p) => p.id === c.parentCategoryId)?.name === "Subscriptions");
    expect(resolveBillCategoryId(bill({ categoryId: oldNetflix.id }), sameParent.categories, "B")).toBe(wanted.id);

    const otherParent = budgetWith("C", [items("Entertainment", "Netflix")], old.categories);
    expect(resolveBillCategoryId(bill({ categoryId: oldNetflix.id }), otherParent.categories, "C")).toBe(catNamed(otherParent.categories, "Netflix", "C").id);
  });

  it("never crosses types: an income bill doesn't pick an expense category of the same name", () => {
    const old = budgetWith("A", [bulk("Bonus")]);
    const cur = budgetWith("B", [bulk("Bonus")], old.categories);
    const incomeBill = bill({ type: "income", categoryId: "gone", categoryName: "Bonus" });
    expect(resolveBillCategoryId(incomeBill, cur.categories, "B")).toBeNull(); // only an expense "Bonus" exists
  });

  it("handles no bill / no categories safely", () => {
    expect(resolveBillCategoryId(null, [], "B")).toBeNull();
    expect(resolveBillCategoryId(bill({ categoryId: "x" }), undefined, "B")).toBeNull();
  });
});

describe("bill edits carry the remembered category name", () => {
  const values = (over = {}) => ({
    name: "Water", type: "expense", amount: 50, accountId: "acc", categoryId: "cat1", categoryName: "Groceries", categoryParentName: null,
    dueDate: "2026-10-05", recurring: false, frequency: null, endDate: null, notes: "", ...over,
  });
  const base = [{ id: "b", name: "Water", type: "expense", amount: 50, accountId: "acc", categoryId: null, dueDate: "2026-10-05", recurring: false, completions: {} }];

  it("a one-time bill edit stores the snapshot", () => {
    const res = applyBillEdit(base, { billId: "b", dateKey: "2026-10-05", values: values(), scope: "following", newId: "n" });
    expect(res.bills[0]).toMatchObject({ categoryId: "cat1", categoryName: "Groceries", categoryParentName: null });
  });

  it("clearing the category clears the snapshot", () => {
    const withCat = [{ ...base[0], categoryId: "cat1", categoryName: "Groceries" }];
    const res = applyBillEdit(withCat, { billId: "b", dateKey: "2026-10-05", values: values({ categoryId: null, categoryName: null }), scope: "following", newId: "n" });
    expect(res.bills[0]).toMatchObject({ categoryId: null, categoryName: null });
  });

  it("'all occurrences' edit updates every segment's category AND its remembered name", () => {
    const seg1 = { id: "s1", seriesId: "s1", name: "Rent", type: "expense", amount: 900, accountId: "acc", categoryId: "old", categoryName: "Housing", dueDate: "2026-01-01", recurring: true, frequency: "monthly", endDate: "2026-06-30", completions: {} };
    const seg2 = { ...seg1, id: "s2", seriesId: "s1", dueDate: "2026-07-01", endDate: null, amount: 950 };
    const res = applyBillEdit([seg1, seg2], {
      billId: "s2", dateKey: "2026-07-01", scope: "all", newId: "n",
      values: { name: "Rent", type: "expense", amount: 950, accountId: "acc", categoryId: "new", categoryName: "Home", categoryParentName: null, dueDate: "2026-07-01", recurring: true, frequency: "monthly", endDate: null, notes: "" },
    });
    for (const seg of res.bills) expect(seg).toMatchObject({ categoryId: "new", categoryName: "Home" });
  });
});

afterEach(() => vi.useRealTimers());
