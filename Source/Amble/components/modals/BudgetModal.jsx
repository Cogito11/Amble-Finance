import React, { useState } from "react";
import {
  Plus, X, Trash2, Repeat, ChevronUp, ChevronDown, Info, GripVertical
} from "lucide-react";
import { Modal } from "../common/Modal";
import { ColorSwatchButton } from "../common/ColorSwatchButton";
import { categoryIncome, nextCategoryColor, budgetCategoryTotal } from "../../state/categories";
import { REPEAT_DUE_PHRASES, nextBudgetDates, budgetDueDate, budgetMatchDurationDays } from "../../state/budgets";
import { todayStr } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";
import { blurOnWheel, uid } from "../../utils/misc";

/* ---------------------------------- budget modal ---------------------------------- */
export function BudgetModal({ initial, transactions, budgets, categories, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [startDate, setStartDate] = useState(initial.startDate || "");
  const [endDate, setEndDate] = useState(initial.endDate || "");
  // Income as a list of named lines (e.g. "Paycheck 1", "Rollover from last month")
  // instead of a single number, so multiple sources add up naturally. Falls back
  // to one line seeded from the old single `income` field for budgets saved before
  // this existed, so it behaves exactly like the old single field until someone
  // actually adds a second line.
  const [incomeItems, setIncomeItems] = useState(
    initial.incomeItems && initial.incomeItems.length
      ? initial.incomeItems
      : [{ id: uid(), name: "Income", mode: "manual", amount: initial.income ?? "" }]
  );
  const [cats, setCats] = useState(
    (initial.categories && initial.categories.length ? initial.categories : []).map((c) => ({
      ...c,
      color: c.color
        || (c.categoryId ? (categories || []).find((cc) => cc.id === c.categoryId)?.color : null)
        || nextCategoryColor(categories, c.name),
    }))
  );
  const [repeatOn, setRepeatOn] = useState(!!(initial.repeat && initial.repeat.enabled));
  const [repeatFreq, setRepeatFreq] = useState((initial.repeat && initial.repeat.frequency) || "monthly");

  const canRepeat = !!(startDate && endDate);
  const matchDays = budgetMatchDurationDays({ startDate, endDate });
  // The day-of-month a monthly repeat should keep aiming for. Preserved from the
  // budget being edited so an already-repeating budget doesn't lose its original
  // anchor (e.g. the 31st) just because a prior cycle landed on a clamped date;
  // only defaults from the current startDate for budgets that haven't repeated yet.
  const repeatAnchorDay = (initial.repeat && initial.repeat.anchorDay) || (startDate ? new Date(startDate + "T00:00:00").getDate() : null);
  // Live preview, in the Edit budget menu, of when this cycle becomes due to
  // repeat and what dates the next cycle would have - mirrors budgetDueDate /
  // nextBudgetDates exactly, using the form's current (possibly unsaved) values.
  const repeatPreview = canRepeat
    ? (() => {
        const due = budgetDueDate({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
        const next = nextBudgetDates({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
        return due && next ? { due, next } : null;
      })()
    : null;
  // Fixed-interval repeats (weekly/biweekly/monthly) become due at a set point
  // after the start date, regardless of how long this budget's own time frame
  // is. If that due date lands before the budget's own end date, the next cycle
  // will kick off - and roll this one to inactive - before it reaches its end
  // date. "Match time frame" can't hit this, since its due date is always the
  // end date itself.
  const repeatCutoffWarning = canRepeat && repeatOn && repeatFreq !== "match" && repeatPreview && repeatPreview.due < endDate;

  const canSave = name.trim().length > 0;
  // Manual rows use whatever's typed in; rows tracked by category resolve to
  // a live total (money already logged against that category), the same
  // relationship categorySpend has to an expense category - so this can move
  // on its own as new income transactions come in, without editing the budget.
  const itemAmount = (it) => {
    if (it.mode !== "category") return Number(it.amount) || 0;
    if (!it.categoryId) return 0;
    const cat = (categories || []).find((c) => c.id === it.categoryId);
    return cat ? categoryIncome(cat, transactions || [], budgets || [], categories || []) : 0;
  };
  const totalIncome = incomeItems.reduce((s, it) => s + itemAmount(it), 0);
  const allocated = cats.reduce((s, c) => s + budgetCategoryTotal(c), 0);
  const remaining = totalIncome - allocated;

  const addIncomeItem = () => {
    setIncomeItems((items) => [...items, { id: uid(), name: "", mode: "manual", amount: "" }]);
  };
  const updateIncomeItem = (id, patch) => {
    setIncomeItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeIncomeItem = (id) => {
    // Always leave at least one line so there's somewhere to enter an amount.
    setIncomeItems((items) => (items.length > 1 ? items.filter((it) => it.id !== id) : items));
  };
  // Moves an income line up/down by one slot for reordering - same approach as moveCategory.
  const moveIncomeItem = (id, direction) => {
    setIncomeItems((items) => {
      const index = items.findIndex((it) => it.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const addCategory = () => {
    setCats((cs) => [...cs, { id: uid(), name: "", mode: "bulk", bulkAmount: 0, date: "", items: [], color: nextCategoryColor([...(categories || []), ...cs], "") }]);
  };
  // Moves a category up/down by one slot for reordering.
  const moveCategory = (id, direction) => {
    setCats((cs) => {
      const index = cs.findIndex((c) => c.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= cs.length) return cs;
      const next = [...cs];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };
  const updateCategory = (id, patch) => {
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCategory = (id) => {
    setCats((cs) => cs.filter((c) => c.id !== id));
  };
  const addItem = (catId) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: [...(c.items || []), { id: uid(), name: "", amount: 0, date: "" }] } : c)));
  };
  const updateItem = (catId, itemId, patch) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: (c.items || []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : c)));
  };
  const removeItem = (catId, itemId) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: (c.items || []).filter((i) => i.id !== itemId) } : c)));
  };
  // Drag-and-drop reorder for a category's sub-expenses - same drop-on-target
  // approach as SidebarSettingsModal/StatusSettingsModal, just scoped to one
  // category's own items array rather than a flat list. Only one drag can be in
  // flight at a time regardless of which category it's in, so the drag state
  // below is shared rather than per-category.
  const [dragItemId, setDragItemId] = useState(null);
  const [overItemId, setOverItemId] = useState(null);
  const reorderItem = (catId, draggedId, targetId) => {
    setCats((cs) => cs.map((c) => {
      if (c.id !== catId) return c;
      const items = c.items || [];
      const draggedIndex = items.findIndex((i) => i.id === draggedId);
      const targetIndex = items.findIndex((i) => i.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return c;
      const next = [...items];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...c, items: next };
    }));
  };

  const submit = () => {
    if (!canSave) return;
    const cleanedIncomeItems = incomeItems.map((it) => ({
      id: it.id,
      name: it.name.trim() || (it.mode === "category" ? "Untitled category" : "Income"),
      mode: it.mode === "category" ? "category" : "manual",
      amount: itemAmount(it),
      categoryId: it.mode === "category" ? (it.categoryId || undefined) : undefined,
    }));
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
      income: cleanedIncomeItems.reduce((s, it) => s + it.amount, 0),
      incomeItems: cleanedIncomeItems,
      dateCreated: initial.dateCreated || todayStr(),
      order: typeof initial.order === "number" ? initial.order : undefined,
      active: initial.active || false,
      repeat: { enabled: canRepeat && repeatOn, frequency: repeatFreq, anchorDay: repeatAnchorDay },
      categories: cats.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        name: c.name.trim() || "Untitled category",
        mode: c.mode === "items" ? "items" : "bulk",
        bulkAmount: Number(c.bulkAmount) || 0,
        date: c.date || null,
        color: c.color,
        items: (c.items || []).map((i) => ({ id: i.id, categoryId: i.categoryId, name: i.name.trim() || "Untitled expense", amount: Number(i.amount) || 0, date: i.date || null })),
      })),
    });
  };

  return (
    <Modal title={isEdit ? "Edit budget" : "New budget"} onClose={onClose} wide>
      <div className="modal-body">
        <div className="form-group">
          <label>Budget name</label>
          <input className="input" placeholder="e.g. July 5 Paycheck" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Start date (optional)</label>
            <input type="date" className="input mono" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End date (optional)</label>
            <input type="date" className="input mono" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {!startDate && !endDate && (
          <div className="tool-note">
            No dates set - this budget will track spending on a rolling 30-day basis instead of a fixed period, and won't be eligible to repeat automatically. Add a start and/or end date if you want it scoped to a specific period instead.
          </div>
        )}

        <div className="budget-repeat-block">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={repeatOn}
              disabled={!canRepeat}
              onChange={(e) => setRepeatOn(e.target.checked)}
            />
            Repeat this budget
          </label>
          {!canRepeat && <p className="settings-desc">Set both a start and end date to enable repeating.</p>}
          {canRepeat && repeatOn && (
            <div className="seg budget-repeat-seg">
              <button type="button" className={`seg-btn ${repeatFreq === "weekly" ? "active" : ""}`} onClick={() => setRepeatFreq("weekly")}>Weekly</button>
              <button type="button" className={`seg-btn ${repeatFreq === "biweekly" ? "active" : ""}`} onClick={() => setRepeatFreq("biweekly")}>Every 2 weeks</button>
              <button type="button" className={`seg-btn ${repeatFreq === "monthly" ? "active" : ""}`} onClick={() => setRepeatFreq("monthly")}>Monthly</button>
              <button type="button" className={`seg-btn ${repeatFreq === "match" ? "active" : ""}`} onClick={() => setRepeatFreq("match")}>Match time frame</button>
            </div>
          )}
          {canRepeat && repeatOn && repeatPreview && (
            <p className="settings-desc">
              {repeatFreq === "match"
                ? `The budget will repeat once it's set to end, on ${fmtDate(endDate)}. `
                : `The budget will repeat ${REPEAT_DUE_PHRASES[repeatFreq]} its start date, on ${fmtDate(repeatPreview.due)}. `}
              When it repeats, the new budget will run for the same length of time as this one ({matchDays} day{matchDays === 1 ? "" : "s"}), starting {fmtDate(repeatPreview.next.startDate)} and ending {fmtDate(repeatPreview.next.endDate)}, carrying forward the same income and categories as a new budget.
            </p>
          )}
          {repeatCutoffWarning && (
            <p className="settings-desc inline-error">
              Warning: This budget is set to run for {matchDays} day{matchDays === 1 ? "" : "s"} (Ending on {fmtDate(endDate)}). Repeating {REPEAT_DUE_PHRASES[repeatFreq]} its start date means the next cycle begins on {fmtDate(repeatPreview.due)}. This budget will be cut off and end early.
            </p>
          )}
        </div>

        <div className="budget-categories">
          <div className="budget-categories-header">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <span className="budget-section-title-text">
                Income
                <button
                  type="button"
                  className="icon-btn budget-info-icon"
                  aria-label="How income modes work"
                  title={"Income entries have 2 different modes.\n\nManual: Type in a fixed amount yourself.\n\nCategory: Create this income field as a category that you can assign income and transfer transactions to. The total value of transactions assigned to that category will be the value used."}
                >
                  <Info size={13} />
                </button>
              </span>
            </div>
          </div>
          <div className="budget-items">
            {incomeItems.map((it, ii) => {
              const isCategory = it.mode === "category";
              return (
                <div key={it.id} className="budget-income-block">
                  <div className="budget-cat-row">
                    <div className="budget-cat-move-btns">
                      <button
                        type="button"
                        className="icon-btn budget-cat-move-btn"
                        title="Move income up"
                        aria-label="Move income up"
                        disabled={ii === 0}
                        onClick={() => moveIncomeItem(it.id, -1)}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn budget-cat-move-btn"
                        title="Move income down"
                        aria-label="Move income down"
                        disabled={ii === incomeItems.length - 1}
                        onClick={() => moveIncomeItem(it.id, 1)}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <input
                      className="input"
                      placeholder={isCategory ? "Category name (e.g. Paycheck)" : "e.g. Paycheck 1, Rollover from last month"}
                      value={it.name}
                      onChange={(e) => updateIncomeItem(it.id, { name: e.target.value })}
                    />
                    <div className="seg budget-income-mode-seg">
                      <button type="button" className={`seg-btn ${!isCategory ? "active" : ""}`} onClick={() => updateIncomeItem(it.id, { mode: "manual" })}>Manual</button>
                      <button type="button" className={`seg-btn ${isCategory ? "active" : ""}`} onClick={() => updateIncomeItem(it.id, { mode: "category" })}>Category</button>
                    </div>
                    {incomeItems.length > 1 && (
                      <button type="button" className="icon-btn" onClick={() => removeIncomeItem(it.id)} aria-label="Remove income item"><Trash2 size={14} /></button>
                    )}
                  </div>
                  {isCategory ? (
                    <div className="form-group budget-cat-bulk">
                      <label>Tracked total</label>
                      <div className="input mono budget-income-tracked" title="Total from income (and any transfer explicitly tagged) transactions assigned to this category">
                        {fmt(itemAmount(it))}
                      </div>
                    </div>
                  ) : (
                    <div className="form-group budget-cat-bulk">
                      <label>Amount</label>
                      <input type="number" min="0" step="0.01" className="input mono" placeholder="0.00" value={it.amount} onChange={(e) => updateIncomeItem(it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="budget-items-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={addIncomeItem}><Plus size={13} /> Add income source</button>
              {incomeItems.length > 1 && <div className="budget-cat-subtotal muted">Total income: {fmt(totalIncome)}</div>}
            </div>
          </div>
        </div>

        <div className="budget-summary-bar">
          <div><span className="muted">Income</span><strong>{fmt(totalIncome)}</strong></div>
          <div><span className="muted">Allocated</span><strong>{fmt(allocated)}</strong></div>
          <div>
            <span className="muted">Remaining</span>
            <strong className={remaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(remaining)}</strong>
          </div>
        </div>

        <div className="budget-categories">
          <div className="budget-categories-header">
            <div className="card-title" style={{ marginBottom: 0 }}>
              <span className="budget-section-title-text">
                Budget categories
                <button
                  type="button"
                  className="icon-btn budget-info-icon"
                  aria-label="How budget category modes work"
                  title={"Budget categories have 2 different modes.\n\nBulk: Set one fixed budgeted amount for the whole category.\n\nItemized: Break the category down into individual expenses, each with their own budgeted amount and optional date, which roll up into the category's total."}
                >
                  <Info size={13} />
                </button>
              </span>
            </div>
          </div>
          {cats.length === 0 && (
            <p className="settings-desc">No categories yet - break your income down into spending buckets, like Rent or Groceries.</p>
          )}
          {cats.map((c, ci) => (
            <div
              key={c.id}
              className="budget-cat-block"
            >
              <div className="budget-cat-row">
                <div className="budget-cat-move-btns">
                  <button
                    type="button"
                    className="icon-btn budget-cat-move-btn"
                    title="Move category up"
                    aria-label="Move category up"
                    disabled={ci === 0}
                    onClick={() => moveCategory(c.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn budget-cat-move-btn"
                    title="Move category down"
                    aria-label="Move category down"
                    disabled={ci === cats.length - 1}
                    onClick={() => moveCategory(c.id, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <ColorSwatchButton color={c.color} onChange={(color) => updateCategory(c.id, { color })} label="Category color" />
                <input className="input" placeholder="Category name (e.g. Streaming services)" value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} />
                <div className="seg budget-cat-seg">
                  <button type="button" className={`seg-btn ${c.mode !== "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "bulk" })}>Bulk</button>
                  <button type="button" className={`seg-btn ${c.mode === "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "items" })}>Itemized</button>
                </div>
                <button type="button" className="icon-btn" onClick={() => removeCategory(c.id)} aria-label="Remove category"><Trash2 size={14} /></button>
              </div>
              {c.mode === "items" ? (
                <div className="budget-items">
                  {(c.items || []).map((it) => (
                    <div
                      key={it.id}
                      className={`budget-item-row ${dragItemId === it.id ? "budget-item-row-dragging" : ""} ${overItemId === it.id && dragItemId && dragItemId !== it.id ? "budget-item-row-drop-target" : ""}`}
                      draggable
                      onDragStart={() => setDragItemId(it.id)}
                      onDragEnd={() => { setDragItemId(null); setOverItemId(null); }}
                      onDragOver={(e) => { e.preventDefault(); if (it.id !== overItemId) setOverItemId(it.id); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragItemId && dragItemId !== it.id) reorderItem(c.id, dragItemId, it.id);
                        setDragItemId(null);
                        setOverItemId(null);
                      }}
                    >
                      <GripVertical size={14} className="budget-item-grip" aria-hidden="true" />
                      <input className="input" placeholder="Expense (e.g. Netflix)" value={it.name} onChange={(e) => updateItem(c.id, it.id, { name: e.target.value })} />
                      <input type="date" className="input mono budget-item-date" title="Date (optional)" value={it.date || ""} onChange={(e) => updateItem(c.id, it.id, { date: e.target.value })} />
                      <input type="number" min="0" step="0.01" className="input mono budget-item-amount" placeholder="0.00" value={it.amount} onChange={(e) => updateItem(c.id, it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                      <button type="button" className="icon-btn" onClick={() => removeItem(c.id, it.id)} aria-label="Remove expense item"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="budget-items-footer">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem(c.id)}><Plus size={13} /> Add expense</button>
                    <div className="budget-cat-subtotal muted">Subtotal: {fmt(budgetCategoryTotal(c))}</div>
                  </div>
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group budget-cat-bulk">
                    <label>Budget amount</label>
                    <input type="number" min="0" step="0.01" className="input mono" placeholder="0.00" value={c.bulkAmount} onChange={(e) => updateCategory(c.id, { bulkAmount: e.target.value })} onWheel={blurOnWheel} />
                  </div>
                  <div className="form-group budget-cat-bulk">
                    <label>Date (optional)</label>
                    <input type="date" className="input mono" value={c.date || ""} onChange={(e) => updateCategory(c.id, { date: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm budget-add-category-btn" onClick={addCategory}><Plus size={14} /> Add category</button>
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save budget</button>
        </div>
      </div>
    </Modal>
  );
}
