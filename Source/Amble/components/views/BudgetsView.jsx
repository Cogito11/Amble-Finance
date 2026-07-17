import React, { useState } from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, ChevronRight
} from "lucide-react";
import { Gauge } from "../common/Gauge";
import { categorySpend, isSpendTx, planAllocated, planCategoryTotal } from "../../state/categories";
import { isWithinRolling30Days } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";

/* ---------------------------------- budgets view ---------------------------------- */
export function BudgetsView({ categories, transactions, onAdd, onEdit, onDelete, plans, onEditPlan, onGoPlans }) {
  const activePlan = (plans || []).find((p) => p.active);

  // Only top-level categories; itemized sub-expenses roll their spend up into the parent.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  const withSpend = expenseCats.map((c) => ({ ...c, spent: categorySpend(c, transactions, plans, categories) }));
  // Gauges: general (non-plan) categories, plus the active plan's categories only - never other plans'.
  const gaugeCats = withSpend.filter((c) => c.limit > 0 && (!c.planId || (activePlan && c.planId === activePlan.id)));

  const planCats = activePlan ? withSpend.filter((c) => c.planId === activePlan.id) : [];
  // "General" means not owned by any plan at all - categories from other (inactive) plans
  // stay out of this list entirely, so they can't be edited/deleted from the Status tab.
  const generalExpenseCats = withSpend.filter((c) => !c.planId);
  const incomeCats = categories.filter((c) => c.type === "income");

  // "Uncategorized" isn't tied to any budget, so - like any category with no time
  // frame - it's scoped to a rolling 30 days rather than the calendar month.
  const rolling30Tx = transactions.filter((t) => t.type === "expense" && isWithinRolling30Days(t.date));
  const uncategorizedSpent = rolling30Tx.filter((t) => !t.categoryId).reduce((s, t) => s + t.amount, 0);
  const totalRollingSpent = rolling30Tx.reduce((s, t) => s + t.amount, 0);

  const renderCategoryRows = (list) => list.map((c) => (
    <tr key={c.id}>
      <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
      <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
      <td className="amount col-center">{c.type === "expense" ? fmt(c.spent) : "—"}</td>
      <td className="amount col-center">{c.type === "expense" ? (c.limit > 0 ? fmt(c.limit) : <span className="muted">Not set</span>) : "—"}</td>
      <td className={`amount col-center ${c.type === "expense" && c.limit > 0 && c.limit - c.spent < 0 ? "tone-rust" : ""}`}>
        {c.type === "expense" && c.limit > 0 ? fmt(c.limit - c.spent) : "—"}
      </td>
      <td className="row-actions-cell">
        <div className="row-actions">
          <button className="icon-btn" onClick={() => onEdit(c)} aria-label="Edit category"><Pencil size={14} /></button>
          <button className="icon-btn" onClick={() => onDelete(c.id)} aria-label="Delete category"><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  ));

  const renderPlanCategoryRows = (list) => list.map((c) => (
    <StatusPlanCategoryRow key={c.id} category={c} categories={categories} transactions={transactions} plans={plans} />
  ));

  return (
    <div className="budget-view">
      {activePlan ? (
        <div className="card plan-active-card">
          <div className="card-title">
            Active budget
            <button className="btn btn-ghost btn-sm" onClick={() => onEditPlan(activePlan)}><Pencil size={14} /> Edit budget</button>
          </div>
          <div className="plan-active-name">{activePlan.name}</div>
          {(activePlan.startDate || activePlan.endDate) && (
            <div className="plan-card-dates muted">
              {activePlan.startDate ? fmtDate(activePlan.startDate) : "No start"} – {activePlan.endDate ? fmtDate(activePlan.endDate) : "No end"}
            </div>
          )}
          <div className="plan-card-stats">
            <div>
              <div className="plan-stat-label">Income</div>
              <div className="plan-stat-value">{fmt(activePlan.income)}</div>
            </div>
            <div>
              <div className="plan-stat-label">Allocated</div>
              <div className="plan-stat-value">{fmt(planAllocated(activePlan))}</div>
            </div>
            <div>
              <div className="plan-stat-label">Remaining to allocate</div>
              <div className={`plan-stat-value ${(Number(activePlan.income) || 0) - planAllocated(activePlan) < 0 ? "tone-rust" : "tone-teal"}`}>
                {fmt((Number(activePlan.income) || 0) - planAllocated(activePlan))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card plan-active-card plan-active-empty">
          <div className="plan-empty-text">
            <div className="plan-empty-title">No active budget</div>
            <p className="settings-desc">Create a budget each payday to break your income down into spending categories, then mark it active to see it here.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onGoPlans}><ClipboardList size={14} /> Go to Budgets</button>
        </div>
      )}

      {(gaugeCats.length > 0 || uncategorizedSpent > 0) && (
        <div className="card">
          <div className="card-title">Category gauges</div>
          <div className="gauge-row">
            {gaugeCats.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
            {uncategorizedSpent > 0 && (
              <Gauge
                spent={uncategorizedSpent}
                limit={totalRollingSpent}
                label="Uncategorized"
                footnote={`${Math.round((uncategorizedSpent / totalRollingSpent) * 100)}% of spending`}
              />
            )}
          </div>
        </div>
      )}

      <div className="card no-pad">
        <div className="card-title padded">
          Budget categories
          {activePlan && <button className="btn btn-ghost btn-sm" onClick={() => onEditPlan(activePlan)}><Pencil size={14} /> Edit budget</button>}
        </div>
        {activePlan && planCats.length > 0 ? (
          <table className="table full">
            <thead><tr><th>Name</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th></tr></thead>
            <tbody>{renderPlanCategoryRows(planCats)}</tbody>
          </table>
        ) : (
          <p className="settings-desc plan-cats-empty">
            {activePlan ? "This budget doesn't have any categories yet. Add some from the Edit budget button above." : "Set a budget active on the Budgets page to see its categories here."}
          </p>
        )}
      </div>

      <div className="card no-pad">
        <div className="card-title padded">
          General categories
          <button className="btn btn-ghost btn-sm" onClick={onAdd}><Plus size={14} /> Add category</button>
        </div>
        <table className="table full">
          <thead><tr><th>Name</th><th>Type</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th><th></th></tr></thead>
          <tbody>
            {renderCategoryRows(generalExpenseCats)}
            {incomeCats.map((c) => (
              <tr key={c.id}>
                <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
                <td className="amount col-center">—</td>
                <td className="amount col-center">—</td>
                <td className="amount col-center">—</td>
                <td className="row-actions-cell">
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => onEdit(c)} aria-label="Edit category"><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => onDelete(c.id)} aria-label="Delete category"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Renders one row of the Status page's "Budget categories" table. Behaves like a
// plain row for bulk categories, but for itemized categories (ones with mirrored
// sub-expense categories) it becomes a click-to-expand parent row plus one sub-row
// per item - matching the expand/collapse UX on the Budgets page.
export function StatusPlanCategoryRow({ category, categories, transactions, plans }) {
  const [expanded, setExpanded] = useState(false);
  const items = categories.filter((cc) => cc.parentCategoryId === category.id);
  const isItemized = items.length > 0;

  if (!isItemized) {
    return (
      <tr>
        <td>{category.name}</td>
        <td className="amount col-center">{fmt(category.spent)}</td>
        <td className="amount col-center">{category.limit > 0 ? fmt(category.limit) : <span className="muted">Not set</span>}</td>
        <td className={`amount col-center ${category.limit > 0 && category.limit - category.spent < 0 ? "tone-rust" : ""}`}>
          {category.limit > 0 ? fmt(category.limit - category.spent) : "—"}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="plan-cat-parent-row" onClick={() => setExpanded((e) => !e)}>
        <td>
          <span className="plan-cat-expand-cell">
            <ChevronRight size={13} className={`plan-cat-chevron${expanded ? " expanded" : ""}`} />
            {category.name}
          </span>
        </td>
        <td className="amount col-center">{fmt(category.spent)}</td>
        <td className="amount col-center">{category.limit > 0 ? fmt(category.limit) : <span className="muted">Not set</span>}</td>
        <td className={`amount col-center ${category.limit > 0 && category.limit - category.spent < 0 ? "tone-rust" : ""}`}>
          {category.limit > 0 ? fmt(category.limit - category.spent) : "—"}
        </td>
      </tr>
      {expanded && items.map((it) => {
        const itSpent = categorySpend(it, transactions, plans, categories);
        const itRemaining = it.limit - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="plan-cat-item-subrow">
            <td className="plan-cat-item-name-cell">{it.name}</td>
            <td className="amount col-center">{fmt(itSpent)}</td>
            <td className="amount col-center">{it.limit > 0 ? fmt(it.limit) : <span className="muted">Not set</span>}</td>
            <td className={`amount col-center ${itOver ? "tone-rust" : ""}`}>{it.limit > 0 ? fmt(itRemaining) : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}

/* ---------------------------------- plans view ---------------------------------- */
// Renders a plan's budget categories as a table with Name / Date / Spent / Budgeted /
// Remaining columns. Bulk categories are a single row; itemized categories get a
// summary row (click to expand) plus one row per sub-expense, each with its own
// optional renewal date, spent, budgeted amount, and remaining balance.
export function PlanCategoryTable({ categories, transactions }) {
  return (
    <table className="table plan-cat-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Date</th>
          <th className="col-center">Spent</th>
          <th className="col-center">Budgeted</th>
          <th className="col-center">Remaining</th>
        </tr>
      </thead>
      <tbody>
        {categories.map((c) => <PlanCategoryRows key={c.id} category={c} transactions={transactions} />)}
      </tbody>
    </table>
  );
}

export function spendForCategoryId(transactions, categoryId) {
  if (!categoryId) return 0;
  return transactions.filter((t) => isSpendTx(t) && t.categoryId === categoryId).reduce((s, t) => s + t.amount, 0);
}

// Total actual spend logged against a plan, across all its categories (and, for
// itemized categories, their line-item sub-categories). Mirrors the per-row logic
// in PlanCategoryRows so the dashboard's "spent" figure always matches the Budgets tab.
export function planTotalSpent(plan, transactions) {
  return (plan.categories || []).reduce((total, c) => {
    const items = c.items || [];
    const relevantIds = [c.categoryId, ...items.map((i) => i.categoryId)].filter(Boolean);
    if (!relevantIds.length) return total;
    return total + transactions.filter((t) => isSpendTx(t) && relevantIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  }, 0);
}

export function PlanCategoryRows({ category, transactions }) {
  const [expanded, setExpanded] = useState(false);
  const budgeted = planCategoryTotal(category);
  const items = category.items || [];
  const isItemized = category.mode === "items" && items.length > 0;

  // Now that itemized expenses are their own selectable sub-categories, the parent's
  // spend rolls up from both direct transactions and any of its item sub-categories.
  const relevantIds = [category.categoryId, ...items.map((i) => i.categoryId)].filter(Boolean);
  const spent = relevantIds.length
    ? transactions.filter((t) => isSpendTx(t) && relevantIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0)
    : null;
  const remaining = spent !== null ? budgeted - spent : null;
  const over = remaining !== null && remaining < 0;

  if (!isItemized) {
    return (
      <tr>
        <td>{category.name}</td>
        <td className="muted">{category.date ? fmtDate(category.date) : "—"}</td>
        <td className="amount col-center">{spent !== null ? fmt(spent) : "—"}</td>
        <td className="amount col-center">{fmt(budgeted)}</td>
        <td className={`amount col-center ${over ? "tone-rust" : ""}`}>{remaining !== null ? fmt(remaining) : "—"}</td>
      </tr>
    );
  }

  return (
    <>
      <tr className="plan-cat-parent-row" onClick={() => setExpanded((e) => !e)}>
        <td>
          <span className="plan-cat-expand-cell">
            <ChevronRight size={13} className={`plan-cat-chevron${expanded ? " expanded" : ""}`} />
            {category.name}
          </span>
        </td>
        <td className="muted">—</td>
        <td className="amount col-center">{spent !== null ? fmt(spent) : "—"}</td>
        <td className="amount col-center">{fmt(budgeted)}</td>
        <td className={`amount col-center ${over ? "tone-rust" : ""}`}>{remaining !== null ? fmt(remaining) : "—"}</td>
      </tr>
      {expanded && items.map((it) => {
        const itBudget = Number(it.amount) || 0;
        const itSpent = spendForCategoryId(transactions, it.categoryId);
        const itRemaining = itBudget - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="plan-cat-item-subrow">
            <td className="plan-cat-item-name-cell">{it.name}</td>
            <td className="muted">{it.date ? fmtDate(it.date) : "—"}</td>
            <td className="amount col-center">{fmt(itSpent)}</td>
            <td className="amount col-center">{fmt(itBudget)}</td>
            <td className={`amount col-center ${itOver ? "tone-rust" : ""}`}>{fmt(itRemaining)}</td>
          </tr>
        );
      })}
    </>
  );
}
