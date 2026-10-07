import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountModal } from "../Amble/components/modals/AccountModal";
import { BillModal } from "../Amble/components/modals/BillModal";
import { BudgetModal } from "../Amble/components/modals/BudgetModal";
import { CategoryModal } from "../Amble/components/modals/CategoryModal";
import { ClosedAccountsModal } from "../Amble/components/modals/ClosedAccountsModal";
import { GoalModal } from "../Amble/components/modals/GoalModal";
import { TransactionModal } from "../Amble/components/modals/TransactionModal";
import { ToolsView } from "../Amble/components/tools/ToolsView";
import { AccountsView } from "../Amble/components/views/AccountsView";
import { BudgetsView } from "../Amble/components/views/BudgetsView";
import { Dashboard } from "../Amble/components/views/Dashboard";
import { PlanView } from "../Amble/components/views/PlanView";
import { StatusView } from "../Amble/components/views/StatusView";
import { TransactionsView } from "../Amble/components/views/TransactionsView";
import { STORAGE_KEY } from "../Amble/constants";
import { computeBalance } from "../Amble/state/accounts";
import { defaultState, rolloverDueBudgets } from "../Amble/state/budgets";
import { clearRemovedCategoryRefs, syncBudgetCategories } from "../Amble/state/categories";
import { loadStoredState } from "../Amble/state/loader";
import { accountTotals, netForMonth } from "../Amble/state/totals";
import { validateState } from "../Amble/state/validate";
import { currentMonthKey, todayStr } from "../Amble/utils/dates";
import { fakeStorage, seededRandom } from "./helpers";

// "Corrupt saved data can't brick the app" - tested directly rather than assumed.
//
// A rich, realistic dataset is corrupted hundreds of different ways (fields deleted, set to null,
// text where numbers belong, junk records, duplicate ids, wrong-typed lists...). Each damaged copy
// is put through the REAL loader and then everything App does next: the startup effects, the
// totals, and rendering every screen and every dialog from the result. Before the validator, a
// single bad value could crash a screen, and because the app auto-saves the crash then repeated on
// every launch. Now none of it may throw.

const noop = () => {};
const today = todayStr();
// CI uses the defaults. To hunt harder locally:  FUZZ_SEED=123 FUZZ_ITERATIONS=2000 npm test -- fuzz
const SEED = Number(process.env.FUZZ_SEED) || 20261004;
const ITERATIONS = Number(process.env.FUZZ_ITERATIONS) || 400;

function richState() {
  const s = defaultState();
  const active = { ...s.plans[0], id: "p1", name: "Oct", active: true, startDate: "2026-10-01", endDate: "2026-10-31", repeat: { enabled: true, frequency: "monthly" },
    incomeItems: [{ id: "ii1", name: "Pay", mode: "manual", amount: 3000 }, { id: "ii2", name: "Side", mode: "category", categoryId: null, amount: 0 }],
    categories: [
      { id: "pc1", name: "Groceries", mode: "bulk", bulkAmount: 400, date: null, items: [] },
      { id: "pc2", name: "Subscriptions", mode: "items", bulkAmount: 0, date: null, items: [{ id: "it1", name: "Netflix", amount: 15, date: "2026-10-05" }, { id: "it2", name: "Spotify", amount: 10, date: null }] },
    ] };
  const other = { ...s.plans[0], id: "p2", name: "Nov", active: false, startDate: "2026-11-01", endDate: "2026-11-30", order: 1, repeat: { enabled: false, frequency: "monthly" }, incomeItems: [], income: 2000, categories: [{ id: "pc3", name: "Rent", mode: "bulk", bulkAmount: 900, date: null, items: [] }] };
  const synced1 = syncBudgetCategories(active, s.categories.filter((c) => !c.planId));
  const synced2 = syncBudgetCategories(other, synced1.categories);
  const groceries = synced2.categories.find((c) => c.name === "Groceries" && c.planId === "p1");
  const accounts = [
    { id: "chk", name: "Checking", type: "checking", startingBalance: 1500.25, order: 0, institution: "Bank" },
    { id: "sav", name: "Savings", type: "savings", startingBalance: 5000, order: 1, interestRate: 4.1 },
    { id: "card", name: "Visa", type: "credit", startingBalance: -820.4, order: 2, interestRate: 21.99 },
    { id: "loan", name: "Car loan", type: "loan", startingBalance: -9000, order: 3 },
    { id: "old", name: "Old", type: "cash", startingBalance: 0, order: 4, closed: true },
  ];
  const tx = (id, type, amount, date, accountId, extra = {}) => ({ id, type, amount, date, accountId, toAccountId: null, categoryId: null, description: `tx ${id}`, notes: "", ...extra });
  const transactions = [
    tx("t1", "expense", 54.3, "2026-10-02", "chk", { categoryId: groceries.id }),
    tx("t2", "income", 3000, "2026-10-01", "chk"),
    tx("t3", "transfer", 200, "2026-10-03", "chk", { toAccountId: "sav" }),
    tx("t4", "expense", 15, "2026-10-05", "card"),
    tx("t5", "expense", 9.99, "2026-09-20", "chk"),
    tx("t6", "income", 12.5, "2026-09-30", "sav"),
    tx("t7", "expense", 100, today, "chk"),
  ];
  const bills = [
    { id: "b1", name: "Rent", type: "expense", amount: 900, accountId: "chk", categoryId: groceries.id, categoryName: "Groceries", categoryParentName: null, dueDate: "2026-10-01", recurring: true, frequency: "monthly", endDate: null, completions: { "2026-10-01": "t5" }, seriesId: "b1" },
    { id: "b2", name: "Gift", type: "expense", amount: 40, accountId: "chk", categoryId: null, dueDate: today, recurring: false, frequency: null, endDate: null, completions: {} },
  ];
  const goals = [
    { id: "g1", name: "Trip", targetAmount: 3000, targetDate: "2027-06-01", trackingMode: "account", accountId: "sav", manualAmount: 0 },
    { id: "g2", name: "Laptop", targetAmount: 1500, targetDate: null, trackingMode: "manual", accountId: null, manualAmount: 400 },
  ];
  return { ...s, accounts, categories: synced2.categories, transactions, plans: [synced1.budget, synced2.budget], bills, goals, currency: "USD", lastBackupAt: null };
}

/* ---------------------------------- the corruption engine ---------------------------------- */

// Every node reachable below the root, as a key path.
function allPaths(node, prefix = [], out = []) {
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) { out.push([...prefix, key]); allPaths(node[key], [...prefix, key], out); }
  }
  return out;
}

const REPLACEMENTS = [null, "garbage", 12345.678, -5, "", true, [], {}, "2026-13-45", "1e999", [null, 1, "x"], { a: 1 }, 0, "0", false];

function corrupt(root, rnd) {
  const paths = allPaths(root);
  const hits = 1 + Math.floor(rnd() * 8);
  for (let i = 0; i < hits; i++) {
    const path = paths[Math.floor(rnd() * paths.length)];
    let parent = root;
    for (const k of path.slice(0, -1)) { parent = parent && parent[k]; }
    if (!parent || typeof parent !== "object") continue;
    const key = path[path.length - 1];
    const roll = rnd();
    if (roll < 0.2) { Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key]; }
    else if (roll < 0.3 && Array.isArray(parent) && parent[key] !== undefined) { parent.splice(Number(key), 0, JSON.parse(JSON.stringify(parent[key]))); } // duplicate (same ids)
    else parent[key] = REPLACEMENTS[Math.floor(rnd() * REPLACEMENTS.length)];
  }
  return root;
}

/* ---------------------------------- everything App does with loaded state ---------------------------------- */

async function loadAndExercise(jsonText) {
  const storage = fakeStorage();
  storage.data.set(STORAGE_KEY, jsonText);
  const loaded = await loadStoredState(storage);
  if (loaded.status === "unreadable") throw new Error(`loader said unreadable: ${loaded.error && loaded.error.message}`);

  // App's startup effects
  let state = loaded.state;
  state = rolloverDueBudgets(state);
  const active = state.plans.find((b) => b.active);
  if (active) {
    const synced = syncBudgetCategories(active, state.categories);
    state = { ...state, plans: state.plans.map((b) => (b.id === active.id ? synced.budget : b)), categories: synced.categories, transactions: clearRemovedCategoryRefs(state.transactions, synced.removedCategoryIds) };
  }

  // App's derived values
  const balances = Object.fromEntries(state.accounts.map((a) => [a.id, computeBalance(a, state.transactions)]));
  accountTotals(state.accounts, balances);
  netForMonth(state.transactions, currentMonthKey());
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)); // the CSV export's sort
  const activeBudgetId = (state.plans.find((b) => b.active) || {}).id;

  const render = (element) => renderToStaticMarkup(element);
  render(<Dashboard accounts={state.accounts} categories={state.categories} transactions={state.transactions} balances={balances} budgets={state.plans} onAdd={noop} onGoTx={noop} onNavigate={noop} widgets={undefined} onCustomize={noop} />);
  render(<StatusView categories={state.categories} transactions={state.transactions} onAdd={noop} onEdit={noop} onDelete={noop} budgets={state.plans} onEditBudget={noop} onGoBudgets={noop} onCustomize={noop} />);
  render(<PlanView activeBudgetId={activeBudgetId} bills={state.bills} goals={state.goals} accounts={state.accounts} categories={state.categories} transactions={state.transactions} balances={balances} onAddBill={noop} onEditBill={noop} onAddGoal={noop} onEditGoal={noop} onAddContribution={noop} onMarkPaid={noop} onUnmarkPaid={noop} onAssignTransaction={noop} onLinkTransaction={noop} />);
  render(<AccountsView accounts={state.accounts} balances={balances} onAdd={noop} onEdit={noop} onReorder={noop} onViewClosed={noop} />);
  render(<BudgetsView budgets={state.plans} transactions={state.transactions} categories={state.categories} onAdd={noop} onEdit={noop} onDelete={noop} onSetActive={noop} onDuplicate={noop} onReorder={noop} />);
  render(<TransactionsView accounts={state.accounts} categories={state.categories} transactions={state.transactions} onEdit={noop} onAdd={noop} onDelete={noop} searchInputRef={{ current: null }} />);
  render(<ToolsView accounts={state.accounts} balances={balances} transactions={state.transactions} />);
  render(<ClosedAccountsModal accounts={state.accounts.filter((a) => a.closed)} balances={balances} onReopen={noop} onEdit={noop} onClose={noop} />);

  // Opening an item to edit it - the other place a damaged record could crash the app.
  if (state.transactions[0]) render(<TransactionModal initial={state.transactions[0]} accounts={state.accounts} categories={state.categories} budgets={state.plans} transactions={state.transactions} onSave={noop} onClose={noop} onDelete={noop} />);
  if (state.accounts[0]) render(<AccountModal initial={state.accounts[0]} onSave={noop} onClose={noop} onDelete={noop} onCloseAccount={noop} onReopenAccount={noop} transactions={state.transactions} currentBalance={balances[state.accounts[0].id]} />);
  if (state.plans[0]) render(<BudgetModal initial={state.plans[0]} transactions={state.transactions} budgets={state.plans} categories={state.categories} onSave={noop} onClose={noop} onDelete={noop} onRecolorCategory={noop} />);
  if (state.bills[0]) render(<BillModal initial={state.bills[0]} occurrenceDate={state.bills[0].dueDate} bills={state.bills} transactions={state.transactions} accounts={state.accounts} categories={state.categories} budgets={state.plans} onSave={noop} onClose={noop} onDelete={noop} onMarkPaid={noop} onUnmarkPaid={noop} onLinkTransaction={noop} onAssignTransaction={noop} />);
  if (state.goals[0]) render(<GoalModal initial={state.goals[0]} accounts={state.accounts} onSave={noop} onClose={noop} onDelete={noop} />);
  if (state.categories[0]) render(<CategoryModal initial={state.categories[0]} categories={state.categories} onSave={noop} onClose={noop} onDelete={noop} />);

  return loaded;
}

describe("corrupt saved data can never crash the app", () => {
  it("the undamaged fixture itself loads cleanly and renders (control)", async () => {
    const loaded = await loadAndExercise(JSON.stringify(richState()));
    expect(loaded.status).toBe("ok");
  });

  it(`survives ${ITERATIONS} different corruptions of a realistic dataset, rendering every screen and dialog`, async () => {
    const rnd = seededRandom(SEED);
    const base = richState();
    const failures = [];
    let repaired = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const damaged = corrupt(JSON.parse(JSON.stringify(base)), rnd);
      const text = JSON.stringify(damaged); // what would actually be on disk (undefined dropped, Infinity -> null)
      try {
        const loaded = await loadAndExercise(text);
        if (loaded.status === "repaired") repaired++;
      } catch (error) {
        failures.push({ iteration: i, error: error && error.message, text });
        if (failures.length >= 3) break;
      }
    }
    if (failures.length) {
      const first = failures[0];
      throw new Error(`Iteration ${first.iteration} crashed: ${first.error}\n\nDamaged data (first 1500 chars):\n${first.text.slice(0, 1500)}`);
    }
    expect(repaired).toBeGreaterThan(ITERATIONS / 8); // sanity: the corruption really did exercise the repair paths
  }, 600000);

  it("the loaded state always has the shape the rest of the app relies on", async () => {
    const rnd = seededRandom(77);
    const base = richState();
    for (let i = 0; i < 300; i++) {
      const result = validateState(JSON.parse(JSON.stringify(corrupt(JSON.parse(JSON.stringify(base)), rnd))));
      expect(result.ok).toBe(true);
      const s = result.state;
      for (const key of ["accounts", "categories", "transactions", "plans", "bills", "goals"]) expect(Array.isArray(s[key])).toBe(true);
      const ids = (list) => list.map((x) => x.id);
      for (const list of [s.accounts, s.categories, s.transactions, s.plans, s.bills, s.goals]) {
        expect(ids(list).every((id) => typeof id === "string" && id !== "")).toBe(true);
        expect(new Set(ids(list)).size).toBe(list.length); // no duplicate ids
      }
      expect(s.transactions.every((t) => Number.isFinite(t.amount) && t.amount >= 0 && typeof t.date === "string" && ["income", "expense", "transfer"].includes(t.type))).toBe(true);
      expect(s.accounts.every((a) => Number.isFinite(a.startingBalance) && typeof a.name === "string")).toBe(true);
      expect(s.bills.every((b) => Number.isFinite(b.amount) && typeof b.dueDate === "string" && typeof b.completions === "object")).toBe(true);
      expect(typeof s.currency).toBe("string");
    }
  });

  it("nothing is lost: every damaged record is either kept or set aside, never dropped", () => {
    const rnd = seededRandom(5);
    const base = richState();
    for (let i = 0; i < 300; i++) {
      const damaged = JSON.parse(JSON.stringify(corrupt(JSON.parse(JSON.stringify(base)), rnd)));
      const result = validateState(damaged);
      const rep = result.report;
      for (const key of ["accounts", "transactions", "categories"]) {
        const input = Array.isArray(damaged[key]) ? damaged[key].length : 0;
        const kept = result.state[key].length;
        const setAside = rep.quarantined.filter((q) => q.collection === key && q.reason !== "expected a list").length;
        expect(kept + setAside, `${key} (iteration ${i})`).toBe(input);
      }
    }
  });
});
