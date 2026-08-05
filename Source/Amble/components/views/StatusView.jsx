import React, { useState } from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, ChevronRight, Sliders, Receipt
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { Gauge } from "../common/Gauge";
import { STATUS_SECTIONS, defaultStatusPrefs } from "../../constants";
import { categorySpend, categorySpendTransactions, budgetAllocated, budgetCategoryTotal } from "../../state/categories";
import { budgetIncomeTotal } from "../../state/budgets";
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

// Gathers the actual transactions behind a spending-breakdown row, pooling across
// every underlying category id that got merged into it (so a "Groceries" row
// merged from two budgets shows transactions from both budgets' Groceries
// categories, and an itemized category's transactions are included alongside
// its parent's direct transactions - categorySpendTransactions' own childIds
// rollup handles that). Newest first, like everywhere else transactions list.
function transactionsForBreakdownRow({ row, categories, mode, transactions, budgets, rolling30Tx }) {
  let txs;
  if (row.key === "uncategorized") {
    // Uncategorized isn't a real category, so there's no categorySpendTransactions
    // to call - just every rolling-30-day expense with no category at all.
    txs = rolling30Tx.filter((t) => !t.categoryId);
  } else if (!row.sourceIds || !row.sourceIds.length) {
    txs = [];
  } else if (mode === "budget") {
    const seen = new Set();
    txs = [];
    row.sourceIds.forEach((id) => {
      const cat = categories.find((cc) => cc.id === id);
      if (!cat) return;
      categorySpendTransactions(cat, transactions, budgets, categories).forEach((t) => {
        if (!seen.has(t.id)) { seen.add(t.id); txs.push(t); }
      });
    });
  } else {
    // Month mode: every rolling-30-day expense whose top-level category (an
    // itemized sub-expense resolves up to its parent) is one of this row's ids.
    const idSet = new Set(row.sourceIds);
    txs = rolling30Tx.filter((t) => {
      if (!t.categoryId) return false;
      const cat = categories.find((cc) => cc.id === t.categoryId);
      const topId = cat ? (cat.parentCategoryId || cat.id) : null;
      return topId && idSet.has(topId);
    });
  }
  return [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------------------------------- status view ---------------------------------- */
export function StatusView({ categories, transactions, onAdd, onEdit, onDelete, budgets, onEditBudget, onGoBudgets, sectionOrder, sectionVisible, onCustomize }) {
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

  const activeBudget = (budgets || []).find((b) => b.active);
  const activeBudgetIncome = activeBudget ? budgetIncomeTotal(activeBudget, transactions, budgets, categories) : 0;
  // Same figures, thresholds, and colors as the Dashboard's "Active budget"
  // widget, so the two agree with each other wherever a person sees them.
  const activeBudgetBudgeted = activeBudget ? budgetAllocated(activeBudget) : 0;
  const activeBudgetSpent = activeBudget ? budgetTotalSpent(activeBudget, transactions, budgets, categories) : 0;
  const activeBudgetRemaining = activeBudgetBudgeted - activeBudgetSpent;
  const activeBudgetPct = activeBudgetBudgeted > 0 ? activeBudgetSpent / activeBudgetBudgeted : 0;
  const activeBudgetBarColor = activeBudgetPct > 1 ? "var(--rust)" : activeBudgetPct > 0.85 ? "var(--amber)" : "var(--teal)";

  // Only top-level categories; itemized sub-expenses roll their spend up into the parent.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  const withSpend = expenseCats.map((c) => ({ ...c, spent: categorySpend(c, transactions, budgets, categories) }));
  // Gauges: general (non-budget) categories, plus the active budget's categories only - never other budgets'.
  const gaugeCats = withSpend.filter((c) => c.limit > 0 && (!c.planId || (activeBudget && c.planId === activeBudget.id)));

  const budgetCats = activeBudget ? withSpend.filter((c) => c.planId === activeBudget.id) : [];
  // "General" means not owned by any budget at all - categories from other (inactive)
  // budgets stay out of this list entirely, so they can't be edited/deleted from the Status tab.
  const generalExpenseCats = withSpend.filter((c) => !c.planId);
  // Same protection as expense categories above: a budget-tracked income category
  // should only be renamed/removed through its owning budget (BudgetModal), never
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
  const [breakdownPeriod, setBreakdownPeriod] = useState(activeBudget ? "budget" : "month");
  const showingBudgetBreakdown = breakdownPeriod === "budget";

  // Budget view: a budget's total is, by definition, just the sum of its own
  // categories - nothing outside those categories counts toward it - so the
  // rows always add up to exactly 100% of the total shown above them.
  const budgetBreakdownRows = budgetCats.map((c) => ({ key: c.id, name: c.name, color: c.color, spent: c.spent, sourceIds: [c.id] }));
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

  // Spending breakdown rows can be expanded to reveal the individual transactions
  // behind that total; only rows with at least one transaction end up clickable
  // (in practice every visible row has one, since it's what produced the total).
  const [expandedBreakdownKey, setExpandedBreakdownKey] = useState(null);
  const selectBreakdownPeriod = (period) => { setBreakdownPeriod(period); setExpandedBreakdownKey(null); };

  const breakdownRows = mergeBreakdownRowsByName(showingBudgetBreakdown ? budgetBreakdownRows : monthBreakdownRows)
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const breakdownTotal = showingBudgetBreakdown ? budgetBreakdownTotal : totalRollingSpent;
  const breakdownRowsWithPct = breakdownRows.map((r) => ({
    ...r,
    pct: breakdownTotal > 0 ? Math.round((r.spent / breakdownTotal) * 100) : 0,
    transactions: transactionsForBreakdownRow({
      row: r,
      categories,
      mode: showingBudgetBreakdown ? "budget" : "month",
      transactions,
      budgets,
      rolling30Tx,
    }),
  }));

  // Allocated vs. spent widget: each category's own budgeted amount as a share
  // of the whole budget (bar length, via the top segmented bar), plus how much
  // of that specific allocation has been spent so far (each row's fill). This
  // is scoped to the active budget only - "allocated" isn't a meaningful
  // concept outside of one, so unlike the breakdown above there's no toggle.
  // Rows show the dollar amount left (or over) rather than a percentage next to
  // the bar - the bar's own fill already communicates percentage-of-allocation
  // visually, so the text is more useful saying something the bar can't: the
  // actual dollar gap.
  const remainingLabel = (allocated, spent) => {
    const remaining = allocated - spent;
    return remaining < 0 ? `+${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} remaining`;
  };
  const allocationRows = budgetCats
    .map((c) => ({ key: c.id, name: c.name, color: c.color, allocated: c.limit || 0, spent: c.spent }))
    .sort((a, b) => b.allocated - a.allocated);
  const allocationTotal = allocationRows.reduce((s, r) => s + r.allocated, 0);
  const allocationRowsWithPct = allocationRows.map((r) => {
    const allocPct = allocationTotal > 0 ? Math.round((r.allocated / allocationTotal) * 100) : 0;
    const spentPct = r.allocated > 0 ? (r.spent / r.allocated) * 100 : 0;
    // Deliberately binary rather than a teal/amber/rust gradient: only overspending
    // should visually interrupt - anything at or under budget reads as plain text,
    // and the bar itself always stays this category's own color (no red highlight),
    // so the one thing that actually needs attention is the only thing that stands out.
    const tone = spentPct > 100 ? "tone-rust" : "";
    return { ...r, allocPct, spentPct, tone };
  });
  // Sub-expense rows for itemized categories - moved here from the Spending
  // Breakdown card, since "how much of each sub-expense's own budgeted amount
  // has been spent" is an allocated-vs-spent question, not a share-of-total-
  // spending one. Only categories with mirrored sub-expense categories (see
  // syncBudgetCategories) get an entry here.
  const allocationItemRows = {};
  budgetCats.forEach((c) => {
    const items = categories.filter((cc) => cc.parentCategoryId === c.id);
    if (!items.length) return;
    allocationItemRows[c.id] = items.map((it) => {
      const itSpent = categorySpend(it, transactions, budgets, categories);
      const itAllocated = it.limit || 0;
      const itSpentPct = itAllocated > 0 ? (itSpent / itAllocated) * 100 : 0;
      const itTone = itSpentPct > 100 ? "tone-rust" : "";
      return { key: it.id, name: it.name, allocated: itAllocated, spent: itSpent, spentPct: itSpentPct, tone: itTone };
    });
  });
  const [expandedAllocKey, setExpandedAllocKey] = useState(null);



  const renderCategoryRows = (list) => list.map((c) => (
    <tr
      key={c.id}
      className="cat-row"
      tabIndex={0}
      onClick={() => { if (window.getSelection().toString()) return; onEdit(c); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(c); } }}
    >
      <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
      <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
      <td className="amount col-center">{c.type === "expense" ? fmt(c.spent) : "—"}</td>
      <td className="amount col-center">{c.type === "expense" ? (c.limit > 0 ? fmt(c.limit) : <span className="muted">Not set</span>) : "—"}</td>
      <td className={`amount col-center ${c.type === "expense" && c.limit > 0 && c.limit - c.spent < 0 ? "tone-rust" : ""}`}>
        {c.type === "expense" && c.limit > 0 ? fmt(c.limit - c.spent) : "—"}
      </td>
      <td className="row-actions-cell">
        <div className="row-actions">
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} aria-label="Delete category"><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  ));

  const renderBudgetCategoryRows = (list) => list.map((c) => (
    <StatusBudgetCategoryRow key={c.id} category={c} categories={categories} transactions={transactions} budgets={budgets} />
  ));

  const sectionEls = {
    activeBudget: activeBudget ? (
        <div className="card budget-active-card" key="activeBudget">
          <div className="card-title">
            Active budget
            <button className="btn btn-ghost btn-sm" onClick={() => onEditBudget(activeBudget)}><Pencil size={14} /> Edit budget</button>
          </div>
          <div className="budget-active-name">{activeBudget.name}</div>
          {(activeBudget.startDate || activeBudget.endDate) && (
            <div className="budget-card-dates muted">
              {activeBudget.startDate ? fmtDate(activeBudget.startDate) : "No start"} – {activeBudget.endDate ? fmtDate(activeBudget.endDate) : "No end"}
            </div>
          )}
          <div className="budget-card-stats">
            <div>
              <div className="budget-stat-label">Income</div>
              <div className="budget-stat-value">{fmt(activeBudgetIncome)}</div>
            </div>
            <div>
              <div className="budget-stat-label">Allocated</div>
              <div className="budget-stat-value">{fmt(budgetAllocated(activeBudget))}</div>
            </div>
            <div>
              <div className="budget-stat-label">Remaining to allocate</div>
              <div className={`budget-stat-value ${activeBudgetIncome - budgetAllocated(activeBudget) < 0 ? "tone-rust" : "tone-teal"}`}>
                {fmt(activeBudgetIncome - budgetAllocated(activeBudget))}
              </div>
            </div>
          </div>

          <div className="dash-budget" style={{ marginTop: 18 }}>
            <div className="dash-budget-bar-track">
              <div className="dash-budget-bar-fill" style={{ width: `${Math.min(activeBudgetPct, 1) * 100}%`, background: activeBudgetBarColor }} />
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
            <div className="budget-summary-bar">
              <div>
                <span className="muted">Budgeted</span>
                <strong>{fmt(activeBudgetBudgeted)}</strong>
              </div>
              <div>
                <span className="muted">Spent</span>
                <strong>{fmt(activeBudgetSpent)}</strong>
              </div>
              <div>
                <span className="muted">Remaining</span>
                <strong className={activeBudgetRemaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(activeBudgetRemaining)}</strong>
              </div>
              <div className="budget-summary-pct">
                <span className="muted">% Spent</span>
                <strong className={activeBudgetPct > 1 ? "tone-rust" : activeBudgetPct > 0.85 ? "tone-amber" : "tone-teal"}>{Math.round(activeBudgetPct * 100)}%</strong>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card budget-active-card budget-active-empty" key="activeBudget">
          <div className="budget-empty-text">
            <div className="budget-empty-title">No active budget</div>
            <p className="settings-desc">Create a budget each payday to break your income down into spending categories, then mark it active to see it here.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onGoBudgets}><ClipboardList size={14} /> Go to Budgets</button>
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
        {showingBudgetBreakdown && !activeBudget ? (
          <p className="chart-empty">No active budget. Set one active on the Budgets page to track its spending here.</p>
        ) : breakdownRowsWithPct.length === 0 ? (
          <p className="chart-empty">{showingBudgetBreakdown ? "No spending logged against this budget yet." : "No expenses logged in the last 30 days."}</p>
        ) : (
          <>
            <div className="spend-breakdown-summary">
              <div className="tool-highlight-label">
                {showingBudgetBreakdown ? `Total spending for ${activeBudget.name} so far` : "Total spending, last 30 days"}
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
                const hasTx = r.transactions.length > 0;
                const isOpen = expandedBreakdownKey === r.key;
                return (
                  <div key={r.key} className="budget-rule-row">
                    <div
                      className={`budget-rule-row-top ${hasTx ? "spend-breakdown-row-clickable" : ""}`}
                      onClick={hasTx ? () => setExpandedBreakdownKey(isOpen ? null : r.key) : undefined}
                    >
                      <span className="spend-breakdown-row-name">
                        {hasTx && <ChevronRight size={13} className={`budget-cat-chevron${isOpen ? " expanded" : ""}`} />}
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
                    {hasTx && isOpen && (
                      <div className="spend-breakdown-subrows">
                        {r.transactions.map((t) => (
                          <div key={t.id} className="spend-breakdown-subrow">
                            <span className="spend-breakdown-row-name">
                              <Receipt size={12} className="muted" />
                              {t.description || "—"}
                            </span>
                            <span>
                              <strong>{fmt(t.amount)}</strong>
                              <span className="muted" style={{ marginLeft: 8 }}>{fmtDate(t.date)}</span>
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
        {!activeBudget ? (
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
              {allocationRowsWithPct.map((r) => {
                const items = allocationItemRows[r.key] || [];
                const hasItems = items.length > 0;
                const isOpen = expandedAllocKey === r.key;
                return (
                  <div key={r.key} className="budget-rule-row">
                    <div
                      className={`budget-rule-row-top ${hasItems ? "spend-breakdown-row-clickable" : ""}`}
                      onClick={hasItems ? () => setExpandedAllocKey(isOpen ? null : r.key) : undefined}
                    >
                      <span className="spend-breakdown-row-name">
                        {hasItems && <ChevronRight size={13} className={`budget-cat-chevron${isOpen ? " expanded" : ""}`} />}
                        <span className="legend-dot" style={{ background: r.color }} />
                        {r.name}
                      </span>
                      {r.allocated > 0 && <span className="muted">{r.allocPct}% of budget</span>}
                    </div>
                    <div className="spend-breakdown-alloc-caption">
                      <span className="muted">
                        {r.allocated > 0 ? `${fmt(r.spent)} of ${fmt(r.allocated)} budgeted` : `${fmt(r.spent)} spent · no budget set`}
                      </span>
                      {r.allocated > 0 && <strong className={r.tone}>{remainingLabel(r.allocated, r.spent)}</strong>}
                    </div>
                    <div className="dash-budget-bar-track">
                      <div className="dash-budget-bar-fill" style={{ width: `${Math.min(r.spentPct, 100)}%`, background: r.color }} />
                    </div>
                    {hasItems && isOpen && (
                      <div className="spend-breakdown-subrows">
                        {items.map((it) => (
                          <div key={it.key} className="spend-breakdown-subrow">
                            <span className="spend-breakdown-row-name">{it.name}</span>
                            <span>
                              <span className="muted">
                                {it.allocated > 0 ? `${fmt(it.spent)} of ${fmt(it.allocated)}` : `${fmt(it.spent)} spent · no budget set`}
                              </span>
                              {it.allocated > 0 && <strong className={it.tone} style={{ marginLeft: 8 }}>{remainingLabel(it.allocated, it.spent)}</strong>}
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
          {activeBudget && <button className="btn btn-ghost btn-sm" onClick={() => onEditBudget(activeBudget)}><Pencil size={14} /> Edit budget</button>}
        </div>
        {activeBudget && budgetCats.length > 0 ? (
          <table className="table full">
            <thead><tr><th>Name</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th></tr></thead>
            <tbody>{renderBudgetCategoryRows(budgetCats)}</tbody>
          </table>
        ) : (
          <p className="settings-desc budget-cats-empty">
            {activeBudget ? "This budget doesn't have any categories yet. Add some from the Edit budget button above." : "Set a budget active on the Budgets page to see its categories here."}
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
              <tr><td colSpan="6"><p className="settings-desc budget-cats-empty">No general categories yet. Add one above, or from a budget's category list.</p></td></tr>
            ) : renderCategoryRows([...generalExpenseCats, ...incomeCats])}
          </tbody>
        </table>
      </div>
    ),
  };

  return (
    <div className="status-view">
      {order.filter((id) => visible[id]).map((id) => sectionEls[id])}
    </div>
  );
}

// Renders one row of the Status page's "Budget categories" table. Behaves like a
// plain row for bulk categories, but for itemized categories (ones with mirrored
// sub-expense categories) it becomes a click-to-expand parent row plus one sub-row
// per item - matching the expand/collapse UX on the Budgets page.
export function StatusBudgetCategoryRow({ category, categories, transactions, budgets }) {
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
      <tr className="budget-cat-parent-row" onClick={() => setExpanded((e) => !e)}>
        <td>
          <span className="budget-cat-expand-cell">
            <ChevronRight size={13} className={`budget-cat-chevron${expanded ? " expanded" : ""}`} />
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
        const itSpent = categorySpend(it, transactions, budgets, categories);
        const itRemaining = it.limit - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="budget-cat-item-subrow">
            <td className="budget-cat-item-name-cell"><span className="legend-dot" style={{ background: it.color || category.color, marginRight: 8 }} />{it.name}</td>
            <td className="amount col-center">{fmt(itSpent)}</td>
            <td className="amount col-center">{it.limit > 0 ? fmt(it.limit) : <span className="muted">Not set</span>}</td>
            <td className={`amount col-center ${itOver ? "tone-rust" : ""}`}>{it.limit > 0 ? fmt(itRemaining) : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}

/* ---------------------------------- budgets page helpers ---------------------------------- */
// Renders a budget's categories as a table with Name / Date / Spent / Budgeted /
// Remaining columns. Bulk categories are a single row; itemized categories get a
// summary row (click to expand) plus one row per sub-expense, each with its own
// optional renewal date, spent, budgeted amount, and remaining balance.
// `categories` here is the budget's own category descriptors (bulkAmount/items/date),
// not the app-wide category list - `allCategories` and `budgets` are the app-wide
// lists, needed so each row can resolve real spend via categorySpend, which is
// what applies the all-time-vs-rolling-30-days rule based on whether the budget
// this category belongs to has a time frame set.
//
// Defined here (rather than in BudgetsView.jsx, which renders the Budgets page and
// imports this) because it's also used by the "Active budget" / "Budget categories"
// sections above on the Status page.
export function BudgetCategoryTable({ categories: budgetCategories, transactions, budgets, allCategories }) {
  return (
    <table className="table budget-cat-table">
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
        {budgetCategories.map((c) => (
          <BudgetCategoryRows key={c.id} category={c} transactions={transactions} budgets={budgets} allCategories={allCategories} />
        ))}
      </tbody>
    </table>
  );
}

// Resolves a mirrored category by id and defers to categorySpend for the actual
// total, so a budget-category-table row always agrees with every other place that
// category's spend is shown (TransactionModal preview, Status page gauges, etc.)
export function spendForCategoryId(transactions, categoryId, budgets, categories) {
  if (!categoryId) return 0;
  const catObj = (categories || []).find((c) => c.id === categoryId);
  if (!catObj) return 0;
  return categorySpend(catObj, transactions, budgets, categories);
}

// Total actual spend logged against a budget, across all its categories (and, for
// itemized categories, their line-item sub-categories, via categorySpend's own
// child-category rollup). Mirrors the per-row logic in BudgetCategoryRows so the
// dashboard's "spent" figure always matches the Budgets tab, and now goes through
// categorySpend so a dateless budget's total is scoped to a rolling 30 days here
// too, the same as everywhere else that budget's categories get shown.
export function budgetTotalSpent(budget, transactions, budgets, categories) {
  return (budget.categories || []).reduce((total, c) => {
    if (!c.categoryId) return total;
    const catObj = (categories || []).find((cc) => cc.id === c.categoryId);
    if (!catObj) return total;
    return total + categorySpend(catObj, transactions, budgets, categories);
  }, 0);
}

export function BudgetCategoryRows({ category, transactions, budgets, allCategories }) {
  const [expanded, setExpanded] = useState(false);
  const budgeted = budgetCategoryTotal(category);
  const items = category.items || [];
  const isItemized = category.mode === "items" && items.length > 0;

  // Now that itemized expenses are their own selectable sub-categories, the parent's
  // spend rolls up from both direct transactions and any of its item sub-categories
  // (categorySpend's own childIds lookup handles that rollup) - and, via categorySpend,
  // this also now respects the all-time-vs-rolling-30-days rule based on whether the
  // owning budget has a time frame, matching every other place spend is shown.
  const catObj = category.categoryId ? (allCategories || []).find((cc) => cc.id === category.categoryId) : null;
  const spent = catObj ? categorySpend(catObj, transactions, budgets, allCategories) : null;
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
      <tr className="budget-cat-parent-row" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
        <td>
          <span className="budget-cat-expand-cell">
            <ChevronRight size={13} className={`budget-cat-chevron${expanded ? " expanded" : ""}`} />
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
        const itSpent = spendForCategoryId(transactions, it.categoryId, budgets, allCategories);
        const itRemaining = itBudget - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="budget-cat-item-subrow">
            <td className="budget-cat-item-name-cell">{it.name}</td>
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
