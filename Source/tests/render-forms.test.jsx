import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TransactionModal } from "../Amble/components/modals/TransactionModal";
import { BillModal } from "../Amble/components/modals/BillModal";
import { AccountModal } from "../Amble/components/modals/AccountModal";
import { GoalModal } from "../Amble/components/modals/GoalModal";
import { BudgetModal } from "../Amble/components/modals/BudgetModal";
import { TransactionsView } from "../Amble/components/views/TransactionsView";
import { PlanView } from "../Amble/components/views/PlanView";
import { defaultState } from "../Amble/state/budgets";
import { syncBudgetCategories } from "../Amble/state/categories";
import { todayStr } from "../Amble/utils/dates";

// Server-rendered checks for the validated forms and the views that surface bad records.
// A rendered Save button is `disabled=""` when the form is invalid.

const noop = () => {};
const today = todayStr();
const accounts = [{ id: "a", name: "Checking", type: "checking", startingBalance: 100 }, { id: "b", name: "Savings", type: "savings", startingBalance: 0 }];
const base = defaultState();
const saveButtonDisabled = (html, label) => new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`).test(html);

const txModal = (initial) => renderToStaticMarkup(
  <TransactionModal initial={initial} accounts={accounts} categories={base.categories} budgets={base.plans} transactions={[]} onSave={noop} onClose={noop} onDelete={noop} />
);

describe("TransactionModal", () => {
  it("a fresh form quietly asks for an amount and keeps Save disabled", () => {
    const html = txModal({});
    expect(html).toContain("Enter an amount.");
    expect(html).toContain("form-hint muted");
    expect(saveButtonDisabled(html, "Save transaction")).toBe(true);
  });

  it("a complete form shows no hint and enables Save", () => {
    const html = txModal({ date: "2026-10-04", amount: 12.5, accountId: "a" });
    expect(html).not.toContain("form-hint");
    expect(saveButtonDisabled(html, "Save transaction")).toBe(false);
  });

  it("editing an undated transaction starts with a BLANK date (not today) and says to choose one", () => {
    const html = txModal({ id: "t1", date: "", amount: 5, accountId: "a", type: "expense", description: "old" });
    expect(html).toContain("Choose a date.");
    expect(html).not.toContain(`value="${today}"`);
    expect(saveButtonDisabled(html, "Save transaction")).toBe(true);
  });

  it("editing a transaction with a valid date keeps it", () => {
    const html = txModal({ id: "t1", date: "2026-03-09", amount: 5, accountId: "a", type: "expense" });
    expect(html).toContain('value="2026-03-09"');
    expect(saveButtonDisabled(html, "Save transaction")).toBe(false);
  });

  it("flags an impossible amount in red", () => {
    const html = txModal({ date: "2026-10-04", amount: "1e999", accountId: "a" });
    expect(html).toContain("That amount is too large.");
    expect(html).toContain("form-hint tone-rust");
  });
});

describe("other forms", () => {
  it("AccountModal: asks for a name first, then validates the balance", () => {
    const render = (initial) => renderToStaticMarkup(<AccountModal initial={initial} onSave={noop} onClose={noop} onDelete={noop} onCloseAccount={noop} onReopenAccount={noop} transactions={[]} currentBalance={0} />);
    expect(render({})).toContain("Enter a name.");
    expect(render({ name: "Chk", startingBalance: 0, id: "x", type: "checking" })).not.toContain("form-hint");
  });

  it("GoalModal", () => {
    const render = (initial) => renderToStaticMarkup(<GoalModal initial={initial} accounts={accounts} onSave={noop} onClose={noop} onDelete={noop} />);
    expect(render({})).toContain("Enter a name.");
    const ok = render({ name: "Trip", targetAmount: 1000, trackingMode: "account", accountId: "a" });
    expect(ok).not.toContain("form-hint");
    expect(saveButtonDisabled(ok, "Save goal")).toBe(false);
    expect(render({ name: "Trip", targetAmount: 0, trackingMode: "account", accountId: "a" })).toContain("Amount must be greater than zero.");
  });

  it("BillModal", () => {
    const render = (initial) => renderToStaticMarkup(<BillModal initial={initial} accounts={accounts} categories={base.categories} budgets={base.plans} transactions={[]} bills={[]} occDate={today} onSave={noop} onClose={noop} onDelete={noop} onMarkPaid={noop} onUnmarkPaid={noop} onAssignTransaction={noop} onLinkTransaction={noop} today={today} />);
    expect(render({})).toContain("Enter a name.");
    const ok = render({ name: "Rent", amount: 1200, accountId: "a", type: "expense", dueDate: today });
    expect(ok).not.toContain("form-hint");
  });

  it("BudgetModal: a name alone is valid; a bad typed amount names the row", () => {
    const render = (initial) => renderToStaticMarkup(<BudgetModal initial={initial} transactions={[]} budgets={base.plans} categories={base.categories} onSave={noop} onClose={noop} onDelete={noop} onRecolorCategory={noop} />);
    expect(render({ name: "Oct" })).not.toContain("form-hint");
    const bad = render({ name: "Oct", categories: [{ id: "c1", name: "Food", mode: "bulk", bulkAmount: "1e999", items: [] }] });
    expect(bad).toContain("Food: That amount is too large.");
  });
});

describe("TransactionsView surfaces undated transactions", () => {
  const view = (transactions) => renderToStaticMarkup(
    <TransactionsView accounts={accounts} categories={base.categories} transactions={transactions} onEdit={noop} onAdd={noop} onDelete={noop} searchInputRef={{ current: null }} />
  );
  const good = { id: "g", type: "expense", amount: 5, accountId: "a", date: "2026-10-01", description: "ok" };

  it("no banner when every transaction has a valid date", () => {
    expect(view([good])).not.toContain("no valid date");
  });

  it("banner counts them, and the row reads 'No date' instead of 'Invalid Date'", () => {
    const html = view([good, { ...good, id: "u1", date: "", description: "mystery" }, { ...good, id: "u2", date: undefined, description: "mystery2" }]);
    expect(html).toContain("2 transactions have no valid date");
    expect(html).toContain("No date");
    expect(html).not.toContain("Invalid Date");
  });

  it("singular wording for exactly one", () => {
    expect(view([good, { ...good, id: "u1", date: "" }])).toContain("1 transaction has no valid date");
  });
});

describe("PlanView shows the category a bill's transaction would actually get", () => {
  const mkCats = (id, names) => {
    const plan = { ...defaultState().plans[0], id, name: id, active: false, income: 0, incomeItems: [], categories: names.map((n) => ({ id: `pc-${n}`, name: n, mode: "bulk", bulkAmount: 10, date: null, items: [] })) };
    return syncBudgetCategories(plan, []).categories;
  };
  const render = (billCategoryName, activeBudgetId, categories) => renderToStaticMarkup(
    <PlanView activeBudgetId={activeBudgetId} bills={[{ id: "b", name: "Gym membership", type: "expense", amount: 30, dueDate: today, recurring: false, completions: {}, accountId: "a", categoryId: categories.find((c) => c.name === billCategoryName && c.planId === "old")?.id }]}
      goals={[]} accounts={accounts} categories={categories} transactions={[]} balances={{ a: 100, b: 0 }}
      onAddBill={noop} onEditBill={noop} onAddGoal={noop} onEditGoal={noop} onAddContribution={noop} onMarkPaid={noop} onUnmarkPaid={noop} onAssignTransaction={noop} onLinkTransaction={noop} />
  );

  it("shows the same-named category of the active budget", () => {
    const categories = [...mkCats("old", ["Fitness"]), ...mkCats("new", ["Fitness"])];
    expect(render("Fitness", "new", categories)).toContain("Checking · Fitness");
  });

  it("shows 'Uncategorized' when the active budget has no such category (was the old budget's name)", () => {
    const categories = [...mkCats("old", ["Fitness"]), ...mkCats("new", ["Groceries"])];
    const html = render("Fitness", "new", categories);
    expect(html).toContain("Checking · Uncategorized");
    expect(html).not.toContain("Checking · Fitness");
  });
});
