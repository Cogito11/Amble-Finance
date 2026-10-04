import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../Amble/components/views/Dashboard";
import { StatusView } from "../Amble/components/views/StatusView";
import { PlanView } from "../Amble/components/views/PlanView";
import { AccountsView } from "../Amble/components/views/AccountsView";
import { BudgetsView } from "../Amble/components/views/BudgetsView";
import { BudgetModal } from "../Amble/components/modals/BudgetModal";
import { computeBalance } from "../Amble/state/accounts";
import { defaultState } from "../Amble/state/budgets";
import { todayStr } from "../Amble/utils/dates";

// Server-render smoke tests: they don't click anything, but they execute every
// render path of the views that compute money totals, so an undefined variable or
// a bad import left behind by a refactor fails here instead of in a user's window.

const noop = () => {};
const today = todayStr();

function fixture() {
  const base = defaultState();
  const accounts = [
    { id: "chk", name: "Checking", type: "checking", startingBalance: 1000.1, order: 0 },
    { id: "sav", name: "Savings", type: "savings", startingBalance: 2000.2, order: 1 },
    { id: "card", name: "Card", type: "credit", startingBalance: -0.3, order: 2 },
  ];
  const transactions = [
    { id: "p1", type: "income", amount: 0.1, accountId: "card", date: today, description: "payment 1" },
    { id: "p2", type: "income", amount: 0.2, accountId: "card", date: today, description: "payment 2" },
    { id: "g1", type: "expense", amount: 23.45, accountId: "chk", date: today, description: "groceries", categoryId: base.categories.find((c) => c.name === "Groceries")?.id || null },
    { id: "i1", type: "income", amount: 3000, accountId: "chk", date: today, description: "paycheck" },
  ];
  const balances = Object.fromEntries(accounts.map((a) => [a.id, computeBalance(a, transactions)]));
  const bills = [{ id: "b1", name: "Rent", amount: 1200.5, dueDate: today, recurring: true, frequency: "monthly", completions: {}, accountId: "chk", categoryId: null }];
  const goals = [{ id: "g", name: "Trip", targetAmount: 1000, trackingMode: "account", accountId: "sav", targetDate: null }];
  return { ...base, accounts, transactions, balances, bills, goals };
}

describe("views render with realistic data", () => {
  const f = fixture();

  it("Dashboard", () => {
    const html = renderToStaticMarkup(
      <Dashboard accounts={f.accounts} categories={f.categories} transactions={f.transactions} balances={f.balances}
        budgets={f.plans} onAdd={noop} onGoTx={noop} onNavigate={noop} widgets={undefined} onCustomize={noop} />
    );
    expect(html).toContain("Net worth");
  });

  it("a card paid off to the cent shows teal $0.00 'Total debt', not red (finding #9, user-visible)", () => {
    const html = renderToStaticMarkup(
      <Dashboard accounts={f.accounts} categories={f.categories} transactions={f.transactions} balances={f.balances}
        budgets={f.plans} onAdd={noop} onGoTx={noop} onNavigate={noop} widgets={undefined} onCustomize={noop} />
    );
    expect(f.balances.card).toBe(0); // exact, not 5.55e-17
    const debtCard = html.slice(html.indexOf("Total debt"), html.indexOf("Total debt") + 160);
    expect(debtCard).toContain("tone-teal");
    expect(debtCard).not.toContain("tone-rust");
  });

  it("Dashboard also survives dust-level debt passed in directly (-1.1e-16)", () => {
    const html = renderToStaticMarkup(
      <Dashboard accounts={f.accounts} categories={f.categories} transactions={f.transactions} balances={{ ...f.balances, card: -1.1e-16 }}
        budgets={f.plans} onAdd={noop} onGoTx={noop} onNavigate={noop} widgets={undefined} onCustomize={noop} />
    );
    const debtCard = html.slice(html.indexOf("Total debt"), html.indexOf("Total debt") + 160);
    expect(debtCard).toContain("tone-teal");
  });

  it("StatusView", () => {
    const html = renderToStaticMarkup(
      <StatusView categories={f.categories} transactions={f.transactions} onAdd={noop} onEdit={noop} onDelete={noop}
        budgets={f.plans} onEditBudget={noop} onGoBudgets={noop} onCustomize={noop} />
    );
    expect(html.length).toBeGreaterThan(100);
  });

  it("PlanView", () => {
    const html = renderToStaticMarkup(
      <PlanView bills={f.bills} goals={f.goals} accounts={f.accounts} categories={f.categories} transactions={f.transactions}
        balances={f.balances} onAddBill={noop} onEditBill={noop} onAddGoal={noop} onEditGoal={noop} onAddContribution={noop}
        onMarkPaid={noop} onUnmarkPaid={noop} onAssignTransaction={noop} onLinkTransaction={noop} />
    );
    expect(html).toContain("Rent");
  });

  it("AccountsView and BudgetsView", () => {
    expect(renderToStaticMarkup(<AccountsView accounts={f.accounts} balances={f.balances} onAdd={noop} onEdit={noop} onReorder={noop} onViewClosed={noop} />)).toContain("Checking");
    expect(renderToStaticMarkup(
      <BudgetsView budgets={f.plans} transactions={f.transactions} categories={f.categories} onAdd={noop} onEdit={noop}
        onDelete={noop} onSetActive={noop} onDuplicate={noop} onReorder={noop} />
    ).length).toBeGreaterThan(100);
  });

  it("BudgetModal (edit) renders the monthly repeat preview with the new wording", () => {
    const active = f.plans[0];
    const html = renderToStaticMarkup(
      <BudgetModal initial={{ ...active, startDate: "2026-10-01", endDate: "2026-10-31", repeat: { enabled: true, frequency: "monthly" } }}
        transactions={f.transactions} budgets={f.plans} categories={f.categories} onSave={noop} onClose={noop} onDelete={noop} onRecolorCategory={noop} />
    );
    expect(html).toContain("same days of the month");
    expect(html).toContain("Nov 30, 2026"); // used to preview Dec 1
    expect(html).not.toContain("Dec 1, 2026");
  });
});
