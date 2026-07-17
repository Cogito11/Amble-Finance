import React from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, CheckCircle2, Copy, Repeat, ChevronUp, ChevronDown
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { PlanCategoryTable } from "./BudgetsView";
import { planAllocated } from "../../state/categories";
import { REPEAT_LABELS, sortedPlansList } from "../../state/plans";
import { fmt, fmtDate } from "../../utils/format";

export function PlansView({ plans, transactions, onAdd, onEdit, onDelete, onSetActive, onDuplicate, onReorder }) {
  if (plans.length === 0) {
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

  const sorted = sortedPlansList(plans);

  return (
    <div className="plans-view">
      <div className="plans-header">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New budget</button>
      </div>
      <div className="plans-list">
        {sorted.map((p, pi) => {
          const allocated = planAllocated(p);
          const remaining = (Number(p.income) || 0) - allocated;
          return (
            <div key={p.id} className={`plan-card ${p.active ? "plan-active" : ""}`}>
              <div className="plan-card-top">
                <div className="plan-card-name">
                  {p.name}
                  {p.active && <span className="pill plan-active-pill"><CheckCircle2 size={11} /> Active</span>}
                  {p.repeat && p.repeat.enabled && (
                    <span className="pill"><Repeat size={11} /> {REPEAT_LABELS[p.repeat.frequency] || "Repeats"}</span>
                  )}
                </div>
                <div className="row-actions">
                  <div className="plan-move-btns">
                    <button
                      type="button"
                      className="icon-btn plan-move-btn"
                      title="Move budget up"
                      aria-label="Move budget up"
                      disabled={pi === 0}
                      onClick={() => onReorder(p.id, -1)}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn plan-move-btn"
                      title="Move budget down"
                      aria-label="Move budget down"
                      disabled={pi === sorted.length - 1}
                      onClick={() => onReorder(p.id, 1)}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <button className="icon-btn" title="Duplicate budget" onClick={() => onDuplicate(p.id)}><Copy size={14} /></button>
                  <button className="icon-btn" title="Edit budget" onClick={() => onEdit(p)}><Pencil size={14} /></button>
                  <button className="icon-btn" title="Delete budget" onClick={() => onDelete(p.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="plan-card-dates muted">
                Created {fmtDate(p.dateCreated)}
                {(p.startDate || p.endDate) && (
                  <> · {p.startDate ? fmtDate(p.startDate) : "No start"} – {p.endDate ? fmtDate(p.endDate) : "No end"}</>
                )}
              </div>
              <div className="plan-card-stats">
                <div>
                  <div className="plan-stat-label">Income</div>
                  <div className="plan-stat-value">{fmt(p.income)}</div>
                </div>
                <div>
                  <div className="plan-stat-label">Allocated</div>
                  <div className="plan-stat-value">{fmt(allocated)}</div>
                </div>
                <div>
                  <div className="plan-stat-label">Remaining</div>
                  <div className={`plan-stat-value ${remaining < 0 ? "tone-rust" : "tone-teal"}`}>{fmt(remaining)}</div>
                </div>
              </div>
              {p.categories && p.categories.length > 0 && (
                <div className="plan-card-catlist">
                  <PlanCategoryTable categories={p.categories} transactions={transactions} />
                </div>
              )}
              <div className="plan-card-footer">
                <button className={`btn btn-sm ${p.active ? "btn-ghost" : "btn-primary"}`} onClick={() => onSetActive(p.id)}>
                  {p.active ? "Unset active" : "Set active"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
