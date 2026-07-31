import React, { useState } from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, ChevronRight, Sliders
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { Gauge } from "../common/Gauge";
import { STATUS_SECTIONS, defaultStatusPrefs } from "../../constants";
import { categorySpend, isSpendTx, planAllocated, planCategoryTotal } from "../../state/categories";
import { planIncomeTotal } from "../../state/plans";
import { isWithinRolling30Days } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";

// Combines spending-breakdown rows that share the same category name into a
// single row (summing their spend, and merging which underlying category ids
// contributed), keeping the color from whichever one appears first. Different
// budgets each mirror their own copy of a category - e.g. two separate
// budgets can both have a "Groceries" category with different underlying ids
// - so the last-30-days view (which can span several budgets' worth of
// transactions) would otherwise show them as separate rows even though they
// mean the same thing to the person reading it.
function mergeBreakdownRowsByName(rows) {
  const merged = [];
  const indexByName = new Map();
  rows.forEach((r) => {
    if (indexByName.has(r.name)) {
      const target = merged[indexByName.get(r.name)];
      target.spent += r.spent;
      if (r.sourceIds) target.sourceIds = [...(target.sourceIds || []), ...r.sourceIds];
    } else {
      indexByName.set(r.name, merged.length);
      merged.push({ ...r, sourceIds: r.sourceIds ? [...r.sourceIds] : undefined });
    }
  });
  return merged;
}

// Builds the expanded sub-expense rows for a breakdown row, pooling sub-items
// across every underlying category id that got merged into it (so a
// "Groceries" row merged from two budgets shows sub-items from both). Each
// sub-expense's percentage is of the grand total for the period, matching
// the top-level rows, rather than of its own parent's total.
//
// A merged row's total can include money that isn't attributable to any of
// those sub-expenses - e.g. one budget's "Eating Out" is itemized (all its
// spend lives in sub-expenses) while another budget's "Eating Out" is a
// plain bulk category (all its spend is logged directly against it, with no
// sub-expenses at all). Rather than let the sub-expense rows silently add up
// to less than the row they're nested under, that difference gets its own
// explicit "Not in a specific expense" row.
function buildSubExpenseRows({ sourceIds, parentSpent, categories, mode, transactions, plans, rolling30Tx, grandTotal }) {
  if (!sourceIds || !sourceIds.length) return [];
  const subCats = categories.filter((cc) => cc.parentCategoryId && sourceIds.includes(cc.parentCategoryId));
  if (!subCats.length) return [];
  const raw = subCats.map((cc) => ({
    key: cc.id,
    name: cc.name,
    color: cc.color || null,
    spent: mode === "budget"
      ? categorySpend(cc, transactions, plans, categories)
      : rolling30Tx.filter((t) => t.categoryId === cc.id).reduce((s, t) => s + t.amount, 0),
  }));
  const merged = mergeBreakdownRowsByName(raw).filter((r) => r.spent > 0);
  const subTotal = merged.reduce((s, r) => s + r.spent, 0);
  const directSpend = Math.round((parentSpent - subTotal) * 100) / 100;
  if (directSpend > 0.004) {
    merged.push({ key: "direct", name: "Not in a specific expense", color: null, spent: directSpend });
  }
  return merged
    .sort((a, b) => b.spent - a.spent)
    .map((r) => ({ ...r, pct: grandTotal > 0 ? Math.round((r.spent / grandTotal) * 100) : 0 }));
}

/* ---------------------------------- budgets view ---------------------------------- */
export function BudgetsView({ categories, transactions, onAdd, onEdit, onDelete, plans, onEditPlan, onGoPlans, sectionOrder, sectionVisible, onCustomize }) {
  const order = sectionOrder || STATUS_SECTIONS.map((s) => s.id);
  const visible = sectionVisible || defaultStatusPrefs().visible;
  const anySectionOn = order.some((id) => visible[id]);
  if (!anySectionOn) {
    return (
      <EmptyState
        icon={Sliders}
        title="Your status page is empty"
        message="Every section is currently hidden. Turn some back on to see your budgets at a glance."
        actionLabel="Customize status page"
        onAction={onCustomize}
      />
    );
  }

  const activePlan = (plans || []).find((p) => p.active);
  const activePlanIncome = activePlan ? planIncomeTotal(activePlan, transactions, plans, categories) : 0;
  // Same figures, thresholds, and colors as the Dashboard's "Active budget"
  // widget, so the two agree with each other wherever a person sees them.
  const activePlanBudgeted = activePlan ? planAllocated(activePlan) : 0;
  const activePlanSpent = activePlan ? planTotalSpent(activePlan, transactions) : 0;
  const activePlanRemaining = activePlanBudgeted - activePlanSpent;
  const activePlanPct = activePlanBudgeted > 0 ? activePlanSpent / activePlanBudgeted : 0;
  const activePlanBarColor = activePlanPct > 1 ? "var(--rust)" : activePlanPct > 0.85 ? "var(--amber)" : "var(--teal)";

  // Only top-level categories; itemized sub-expenses roll their spend up into the parent.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  const withSpend = expenseCats.map((c) => ({ ...c, spent: categorySpend(c, transactions, plans, categories) }));
  // Gauges: general (non-plan) categories, plus the active plan's categories only - never other plans'.
  const gaugeCats = withSpend.filter((c) => c.limit > 0 && (!c.planId || (activePlan && c.planId === activePlan.id)));

  const planCats = activePlan ? withSpend.filter((c) => c.planId === activePlan.id) : [];
  // "General" means not owned by any plan at all - categories from other (inactive) plans
  // stay out of this list entirely, so they can't be edited/deleted from the Status tab.
  const generalExpenseCats = withSpend.filter((c) => !c.planId);
  // Same protection as expense categories above: a budget-tracked income category
  // should only be renamed/removed through its owning budget (PlanModal), never
  // deleted straight from here - doing so would leave that budget's income entry
  // pointing at nothing until it's next opened/saved.
  const incomeCats = categories.filter((c) => c.type === "income" && !c.planId);

  // "Uncategorized" isn't tied to any budget, so - like any category with no time
  // frame - it's scoped to a rolling 30 days rather than the calendar month.
  const rolling30Tx = transactions.filter((t) => t.type === "expense" && isWithinRolling30Days(t.date));
  const uncategorizedSpent = rolling30Tx.filter((t) => !t.categoryId).reduce((s, t) => s + t.amount, 0);
  const totalRollingSpent = rolling30Tx.reduce((s, t) => s + t.amount, 0);

  // Spending breakdown card: defaults to the active budget if one's set, else
  // falls back to the rolling 30-day view, but can be toggled either way.
  const [breakdownPeriod, setBreakdownPeriod] = useState(activePlan ? "budget" : "month");
  const showingBudgetBreakdown = breakdownPeriod === "budget";

  // Budget view: a budget's total is, by definition, just the sum of its own
  // categories - nothing outside those categories counts toward it - so the
  // rows always add up to exactly 100% of the total shown above them.
  const budgetBreakdownRows = planCats.map((c) => ({ key: c.id, name: c.name, color: c.color, spent: c.spent, sourceIds: [c.id] }));
  const budgetBreakdownTotal = budgetBreakdownRows.reduce((s, r) => s + r.spent, 0);

  // Month view: every rolling-30-day expense, grouped by its top-level category
  // (an itemized sub-expense rolls its spend up into its parent, same as the
  // gauges above), plus a real Uncategorized row for spend with no category at
  // all - so this total also always matches the sum of its rows.
  const monthByTopCategory = {};
  rolling30Tx.forEach((t) => {
    if (!t.categoryId) return;
    const cat = categories.find((c) => c.id === t.categoryId);
    const top = cat ? (cat.parentCategoryId ? categories.find((c) => c.id === cat.parentCategoryId) : cat) : null;
    if (!top) return;
    monthByTopCategory[top.id] = (monthByTopCategory[top.id] || 0) + t.amount;
  });
  const monthBreakdownRows = Object.entries(monthByTopCategory).map(([id, spent]) => {
    const cat = categories.find((c) => c.id === id);
    return { key: id, name: cat?.name || "Unknown", color: cat?.color || "var(--text-faint)", spent, sourceIds: [id] };
  });
  if (uncategorizedSpent > 0) {
    monthBreakdownRows.push({ key: "uncategorized", name: "Uncategorized", color: "var(--text-faint)", spent: uncategorizedSpent });
  }

  // Spending breakdown rows can be expanded to reveal their sub-expenses
  // (e.g. "Groceries" -> "Trader Joe's", "Costco"); only rows with at least
  // one sub-expense end up clickable.
  const [expandedBreakdownKey, setExpandedBreakdownKey] = useState(null);
  const selectBreakdownPeriod = (period) => { setBreakdownPeriod(period); setExpandedBreakdownKey(null); };

  const breakdownRows = mergeBreakdownRowsByName(showingBudgetBreakdown ? budgetBreakdownRows : monthBreakdownRows)
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const breakdownTotal = showingBudgetBreakdown ? budgetBreakdownTotal : totalRollingSpent;
  const breakdownRowsWithPct = breakdownRows.map((r) => ({
    ...r,
    pct: breakdownTotal > 0 ? Math.round((r.spent / breakdownTotal) * 100) : 0,
    subRows: buildSubExpenseRows({
      sourceIds: r.sourceIds,
      parentSpent: r.spent,
      categories,
      mode: showingBudgetBreakdown ? "budget" : "month",
      transactions,
      plans,
      rolling30Tx,
      grandTotal: breakdownTotal,
    }),
  }));

  // Allocated vs. spent widget: each category's own budgeted amount as a share
  // of the whole budget (bar length, via the top segmented bar), plus how much
  // of that specific allocation has been spent so far (each row's fill). This
  // is scoped to the active budget only - "allocated" isn't a meaningful
  // concept outside of one, so unlike the breakdown above there's no toggle.
  const allocationRows = planCats
    .map((c) => ({ key: c.id, name: c.name, color: c.color, allocated: c.limit || 0, spent: c.spent }))
    .sort((a, b) => b.allocated - a.allocated);
  const allocationTotal = allocationRows.reduce((s, r) => s + r.allocated, 0);
  const allocationRowsWithPct = allocationRows.map((r) => {
    const allocPct = allocationTotal > 0 ? Math.round((r.allocated / allocationTotal) * 100) : 0;
    const spentPct = r.allocated > 0 ? (r.spent / r.allocated) * 100 : 0;
    const tone = r.allocated === 0 ? "" : spentPct > 100 ? "tone-rust" : spentPct > 85 ? "tone-amber" : "tone-teal";
    const barColor = r.allocated === 0 ? "var(--text-faint)" : spentPct > 100 ? "var(--rust)" : spentPct > 85 ? "var(--amber)" : "var(--teal)";
    return { ...r, allocPct, spentPct, tone, barColor };
  });

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

  const sectionEls = {
    activeBudget: activePlan ? (
        <div className="card plan-active-card" key="activeBudget">
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
              <div className="plan-stat-value">{fmt(activePlanIncome)}</div>
            </div>
            <div>
              <div className="plan-stat-label">Allocated</div>
              <div className="plan-stat-value">{fmt(planAllocated(activePlan))}</div>
            </div>
            <div>
              <div className="plan-stat-label">Remaining to allocate</div>
              <div className={`plan-stat-value ${activePlanIncome - planAllocated(activePlan) < 0 ? "tone-rust" : "tone-teal"}`}>
                {fmt(activePlanIncome - planAllocated(activePlan))}
              </div>
            </div>
          </div>

          <div className="dash-budget" style={{ marginTop: 18 }}>
            <div className="dash-budget-bar-track">
              <div className="dash-budget-bar-fill" style={{ width: `${Math.min(activePlanPct, 1) * 100}%`, background: activePlanBarColor }} />
              <div className="dash-budget-bar-ticks">
                <span className="dash-budget-bar-tick" style={{ left: "25%" }} />
                <span className="dash-budget-bar-tick" style={{ left: "50%" }} />
                <span className="dash-budget-bar-tick" style={{ left: "75%" }} />
              </div>
            </div>
            <div className="dash-budget-bar-scale">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
            <div className="plan-summary-bar">
              <div>
                <span className="muted">Budgeted</span>
                <strong>{fmt(activePlanBudgeted)}</strong>
              </div>
              <div>
                <span className="muted">Spent</span>
                <strong>{fmt(activePlanSpent)}</strong>
              </div>
              <div>
                <span className="muted">Remaining</span>
                <strong className={activePlanRemaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(activePlanRemaining)}</strong>
              </div>
              <div className="plan-summary-pct">
                <span className="muted">% Spent</span>
                <strong className={activePlanPct > 1 ? "tone-rust" : activePlanPct > 0.85 ? "tone-amber" : "tone-teal"}>{Math.round(activePlanPct * 100)}%</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card plan-active-card plan-active-empty" key="activeBudget">
          <div className="plan-empty-text">
            <div className="plan-empty-title">No active budget</div>
            <p className="settings-desc">Create a budget each payday to break your income down into spending categories, then mark it active to see it here.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onGoPlans}><ClipboardList size={14} /> Go to Budgets</button>
        </div>
      ),

    spendingBreakdown: (
      <div className="card" key="spendingBreakdown">
        <div className="card-title">
          Spending breakdown
          <div className="seg card-corner-seg" role="group" aria-label="Breakdown period">
            <button type="button" className={`seg-btn ${showingBudgetBreakdown ? "active" : ""}`} onClick={() => selectBreakdownPeriod("budget")}>Active budget</button>
            <button type="button" className={`seg-btn ${!showingBudgetBreakdown ? "active" : ""}`} onClick={() => selectBreakdownPeriod("month")}>Last 30 days</button>
          </div>
        </div>
        {showingBudgetBreakdown && !activePlan ? (
          <p className="chart-empty">No active budget. Set one active on the Budgets page to track its spending here.</p>
        ) : breakdownRowsWithPct.length === 0 ? (
          <p className="chart-empty">{showingBudgetBreakdown ? "No spending logged against this budget yet." : "No expenses logged in the last 30 days."}</p>
        ) : (
          <>
            <div className="spend-breakdown-summary">
              <div className="tool-highlight-label">
                {showingBudgetBreakdown ? `Total spending for ${activePlan.name} so far` : "Total spending, last 30 days"}
              </div>
              <div className="tool-highlight-value">{fmt(breakdownTotal)}</div>
            </div>
            <div className="spend-breakdown-track">
              {breakdownRowsWithPct.map((r) => (
                <div key={r.key} className="spend-breakdown-segment" style={{ flex: `${r.spent} 1 0%`, background: r.color }} title={`${r.name} · ${r.pct}%`} />
              ))}
            </div>
            <div className="budget-rule-rows spend-breakdown-rows">
              {breakdownRowsWithPct.map((r) => {
                const hasSub = r.subRows.length > 0;
                const isOpen = expandedBreakdownKey === r.key;
                return (
                  <div key={r.key} className="budget-rule-row">
                    <div
                      className={`budget-rule-row-top ${hasSub ? "spend-breakdown-row-clickable" : ""}`}
                      onClick={hasSub ? () => setExpandedBreakdownKey(isOpen ? null : r.key) : undefined}
                    >
                      <span className="spend-breakdown-row-name">
                        {hasSub && <ChevronRight size={13} className={`plan-cat-chevron${isOpen ? " expanded" : ""}`} />}
                        <span className="legend-dot" style={{ background: r.color }} />
                        {r.name}
                      </span>
                      <span>
                        <strong>{fmt(r.spent)}</strong>
                        <span className="muted" style={{ marginLeft: 8 }}>{r.pct}%</span>
                      </span>
                    </div>
                    <div className="dash-budget-bar-track">
                      <div className="dash-budget-bar-fill" style={{ width: `${r.pct}%`, background: r.color }} />
                    </div>
                    {hasSub && isOpen && (
                      <div className="spend-breakdown-subrows">
                        {r.subRows.map((sr) => (
                          <div key={sr.key} className="spend-breakdown-subrow">
                            <span className="spend-breakdown-row-name">
                              <span className="legend-dot" style={{ background: sr.color || r.color }} />
                              {sr.name}
                            </span>
                            <span>
                              <strong>{fmt(sr.spent)}</strong>
                              <span className="muted" style={{ marginLeft: 8 }}>{sr.pct}%</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    ),

    allocatedVsSpent: (
      <div className="card" key="allocatedVsSpent">
        <div className="card-title">Allocated vs. spent</div>
        {!activePlan ? (
          <p className="chart-empty">No active budget. Set one active on the Budgets page to see how it's allocated.</p>
        ) : allocationRows.length === 0 ? (
          <p className="chart-empty">This budget doesn't have any categories yet.</p>
        ) : (
          <>
            {allocationTotal > 0 && (
              <div className="spend-breakdown-track">
                {allocationRowsWithPct.filter((r) => r.allocated > 0).map((r) => (
                  <div key={r.key} className="spend-breakdown-segment" style={{ flex: `${r.allocated} 1 0%`, background: r.color }} title={`${r.name} · ${r.allocPct}% of budget`} />
                ))}
              </div>
            )}
            <div className="budget-rule-rows spend-breakdown-rows">
              {allocationRowsWithPct.map((r) => (
                <div key={r.key} className="budget-rule-row">
                  <div className="budget-rule-row-top">
                    <span className="spend-breakdown-row-name">
                      <span className="legend-dot" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    {r.allocated > 0 && <span className="muted">{r.allocPct}% of budget</span>}
                  </div>
                  <div className="spend-breakdown-alloc-caption">
                    <span className="muted">
                      {r.allocated > 0 ? `${fmt(r.spent)} of ${fmt(r.allocated)} budgeted` : `${fmt(r.spent)} spent · no budget set`}
                    </span>
                    {r.allocated > 0 && <strong className={r.tone}>{Math.round(r.spentPct)}%</strong>}
                  </div>
                  <div className="dash-budget-bar-track">
                    <div className="dash-budget-bar-fill" style={{ width: `${Math.min(r.spentPct, 100)}%`, background: r.barColor }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    ),

    categoryGauges: (gaugeCats.length > 0 || uncategorizedSpent > 0) ? (
        <div className="card" key="categoryGauges">
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
      ) : null,

    budgetCategories: (
      <div className="card no-pad" key="budgetCategories">
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
    ),

    generalCategories: (
      <div className="card no-pad" key="generalCategories">
        <div className="card-title padded">
          General categories
          <button className="btn btn-ghost btn-sm" onClick={onAdd}><Plus size={14} /> Add category</button>
        </div>
        <table className="table full">
          <thead><tr><th>Name</th><th>Type</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th><th></th></tr></thead>
          <tbody>
            {generalExpenseCats.length + incomeCats.length === 0 ? (
              <tr><td colSpan="6"><p className="settings-desc plan-cats-empty">No general categories yet. Add one above, or from a budget's category list.</p></td></tr>
            ) : renderCategoryRows([...generalExpenseCats, ...incomeCats])}
          </tbody>
        </table>
      </div>
    ),
  };

  return (
    <div className="budget-view">
      {order.filter((id) => visible[id]).map((id) => sectionEls[id])}
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
        <td><span className="legend-dot" style={{ background: category.color, marginRight: 8 }} />{category.name}</td>
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
            <span className="legend-dot" style={{ background: category.color }} />
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
            <td className="plan-cat-item-name-cell"><span className="legend-dot" style={{ background: it.color || category.color, marginRight: 8 }} />{it.name}</td>
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
      <tr className="plan-cat-parent-row" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
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
