import React from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, CheckCircle2, Copy, Repeat, ChevronUp, ChevronDown
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { BudgetCategoryTable } from "./StatusView";
import { budgetAllocated } from "../../state/categories";
import { REPEAT_LABELS, budgetIncomeTotal, sortedBudgetsList } from "../../state/budgets";
import { fmt, fmtDate } from "../../utils/format";

export function BudgetsView({ budgets, transactions, categories, onAdd, onEdit, onDelete, onSetActive, onDuplicate, onReorder }) {
  if (budgets.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No budgets yet"
        message="Create a budget every payday to break your income down into spending categories before you spend against it."
        actionLabel="Create budget"
        onAction={onAdd}
      />
    );
  }

  const sorted = sortedBudgetsList(budgets);

  return (
    <div className="budgets-view">
      <div className="budgets-header">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New budget</button>
      </div>
      <div className="budgets-list">
        {sorted.map((b, bi) => {
          const allocated = budgetAllocated(b);
          const income = budgetIncomeTotal(b, transactions, budgets, categories);
          const remaining = income - allocated;
          return (
            <div
              key={b.id}
              className={`budget-card ${b.active ? "budget-active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => { if (window.getSelection().toString()) return; onEdit(b); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(b); } }}
            >
              <div className="budget-card-top">
                <div className="budget-card-name">
                  {b.name}
                  {b.active && <span className="pill budget-active-pill"><CheckCircle2 size={11} /> Active</span>}
                  {b.repeat && b.repeat.enabled && (
                    <span className="pill"><Repeat size={11} /> {REPEAT_LABELS[b.repeat.frequency] || "Repeats"}</span>
                  )}
                </div>
                <div className="row-actions">
                  <div className="budget-move-btns">
                    <button
                      type="button"
                      className="icon-btn budget-move-btn"
                      title="Move budget up"
                      aria-label="Move budget up"
                      disabled={bi === 0}
                      onClick={(e) => { e.stopPropagation(); onReorder(b.id, -1); }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn budget-move-btn"
                      title="Move budget down"
                      aria-label="Move budget down"
                      disabled={bi === sorted.length - 1}
                      onClick={(e) => { e.stopPropagation(); onReorder(b.id, 1); }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <button className="icon-btn" title="Duplicate budget" onClick={(e) => { e.stopPropagation(); onDuplicate(b.id); }}><Copy size={14} /></button>
                  <button className="icon-btn" title="Edit budget" aria-label="Edit budget" onClick={(e) => { e.stopPropagation(); onEdit(b); }}><Pencil size={14} /></button>
                  <button className="icon-btn" title="Delete budget" onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="budget-card-dates muted">
                Created {fmtDate(b.dateCreated)}
                {(b.startDate || b.endDate) && (
                  <> · {b.startDate ? fmtDate(b.startDate) : "No start"} – {b.endDate ? fmtDate(b.endDate) : "No end"}</>
                )}
              </div>
              <div className="budget-card-stats">
                <div>
                  <div className="budget-stat-label">Income</div>
                  <div className="budget-stat-value">{fmt(income)}</div>
                </div>
                <div>
                  <div className="budget-stat-label">Allocated</div>
                  <div className="budget-stat-value">{fmt(allocated)}</div>
                </div>
                <div>
                  <div className="budget-stat-label">Remaining</div>
                  <div className={`budget-stat-value ${remaining < 0 ? "tone-rust" : "tone-teal"}`}>{fmt(remaining)}</div>
                </div>
              </div>
              {b.categories && b.categories.length > 0 && (
                <div className="budget-card-catlist">
                  <BudgetCategoryTable categories={b.categories} transactions={transactions} budgets={budgets} allCategories={categories} />
                </div>
              )}
              <div className="budget-card-footer">
                <button className={`btn btn-sm ${b.active ? "btn-ghost" : "btn-primary"}`} onClick={(e) => { e.stopPropagation(); onSetActive(b.id); }}>
                  {b.active ? "Unset active" : "Set active"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
