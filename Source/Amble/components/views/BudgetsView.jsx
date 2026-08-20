import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Pencil, Trash2, ClipboardList, CheckCircle2, Copy, Repeat, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { BudgetCategoryTable } from "./StatusView";
import { budgetAllocated } from "../../state/categories";
import { REPEAT_LABELS, budgetIncomeTotal, sortedBudgetsList } from "../../state/budgets";
import { fmt, fmtDate } from "../../utils/format";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export function BudgetsView({ budgets, transactions, categories, onAdd, onEdit, onDelete, onSetActive, onDuplicate, onReorder }) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => sortedBudgetsList(budgets), [budgets]);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clampedPage = Math.min(page, totalPages);
  const startIndex = (clampedPage - 1) * pageSize;
  const pageItems = sorted.slice(startIndex, startIndex + pageSize);
  const rangeStart = total === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + pageSize, total);

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

  return (
    <div className="budgets-view">
      <div className="budgets-header">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New budget</button>
      </div>
      <div className="budgets-list">
        {pageItems.map((b, pi) => {
          const bi = startIndex + pi;
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
      <div className="budgets-pagination">
        <div className="budgets-pagination-info muted">
          Showing {rangeStart}-{rangeEnd} of {total}
        </div>
        <div className="budgets-pagination-nav">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={clampedPage === 1}
            onClick={() => setPage(clampedPage - 1)}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <select
            className="select budgets-pagination-select"
            value={clampedPage}
            onChange={(e) => setPage(Number(e.target.value))}
            aria-label="Select page"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>Page {p} of {totalPages}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={clampedPage === totalPages}
            onClick={() => setPage(clampedPage + 1)}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
        <div className="budgets-pagination-size">
          <span className="muted">Showing</span>
          <select
            className="select budgets-pagination-size-select"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            aria-label="Budgets per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="muted">per page</span>
        </div>
      </div>
    </div>
  );
}
