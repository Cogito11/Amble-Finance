import React, { useState } from "react";
import {
  Plus, X, Trash2, Repeat, ChevronUp, ChevronDown
} from "lucide-react";
import { Modal } from "../common/Modal";
import { planCategoryTotal } from "../../state/categories";
import { REPEAT_DUE_PHRASES, nextPlanDates, planDueDate, planMatchDurationDays } from "../../state/plans";
import { todayStr } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";
import { blurOnWheel, uid } from "../../utils/misc";

/* ---------------------------------- plan modal ---------------------------------- */
export function PlanModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [startDate, setStartDate] = useState(initial.startDate || "");
  const [endDate, setEndDate] = useState(initial.endDate || "");
  // Income as a list of named lines (e.g. "Paycheck 1", "Rollover from last month")
  // instead of a single number, so multiple sources add up naturally. Falls back
  // to one line seeded from the old single `income` field for plans saved before
  // this existed, so it behaves exactly like the old single field until someone
  // actually adds a second line.
  const [incomeItems, setIncomeItems] = useState(
    initial.incomeItems && initial.incomeItems.length
      ? initial.incomeItems
      : [{ id: uid(), name: "Income", amount: initial.income ?? "" }]
  );
  const [cats, setCats] = useState(
    initial.categories && initial.categories.length ? initial.categories : []
  );
  const [repeatOn, setRepeatOn] = useState(!!(initial.repeat && initial.repeat.enabled));
  const [repeatFreq, setRepeatFreq] = useState((initial.repeat && initial.repeat.frequency) || "monthly");

  const canRepeat = !!(startDate && endDate);
  const matchDays = planMatchDurationDays({ startDate, endDate });
  // The day-of-month a monthly repeat should keep aiming for. Preserved from the
  // plan being edited so an already-repeating budget doesn't lose its original
  // anchor (e.g. the 31st) just because a prior cycle landed on a clamped date;
  // only defaults from the current startDate for plans that haven't repeated yet.
  const repeatAnchorDay = (initial.repeat && initial.repeat.anchorDay) || (startDate ? new Date(startDate + "T00:00:00").getDate() : null);
  // Live preview, in the Edit budget menu, of when this cycle becomes due to
  // repeat and what dates the next cycle would have - mirrors planDueDate /
  // nextPlanDates exactly, using the form's current (possibly unsaved) values.
  const repeatPreview = canRepeat
    ? (() => {
        const due = planDueDate({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
        const next = nextPlanDates({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
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
  const totalIncome = incomeItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const allocated = cats.reduce((s, c) => s + planCategoryTotal(c), 0);
  const remaining = totalIncome - allocated;

  const addIncomeItem = () => {
    setIncomeItems((items) => [...items, { id: uid(), name: "", amount: "" }]);
  };
  const updateIncomeItem = (id, patch) => {
    setIncomeItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeIncomeItem = (id) => {
    // Always leave at least one line so there's somewhere to enter an amount.
    setIncomeItems((items) => (items.length > 1 ? items.filter((it) => it.id !== id) : items));
  };

  const addCategory = () => {
    setCats((cs) => [...cs, { id: uid(), name: "", mode: "bulk", bulkAmount: 0, date: "", items: [] }]);
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

  const submit = () => {
    if (!canSave) return;
    const cleanedIncomeItems = incomeItems.map((it) => ({ id: it.id, name: it.name.trim() || "Income", amount: Number(it.amount) || 0 }));
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
        <div className="form-group">
          <label>Income</label>
          <div className="plan-items">
            {incomeItems.map((it) => (
              <div key={it.id} className="plan-item-row">
                <input className="input" placeholder="e.g. Paycheck 1, Rollover from last month" value={it.name} onChange={(e) => updateIncomeItem(it.id, { name: e.target.value })} />
                <input type="number" min="0" step="0.01" className="input mono plan-item-amount" placeholder="0.00" value={it.amount} onChange={(e) => updateIncomeItem(it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                {incomeItems.length > 1 && (
                  <button type="button" className="icon-btn" onClick={() => removeIncomeItem(it.id)} aria-label="Remove income item"><X size={14} /></button>
                )}
              </div>
            ))}
            <div className="plan-items-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={addIncomeItem}><Plus size={13} /> Add income source</button>
              {incomeItems.length > 1 && <div className="plan-cat-subtotal muted">Total income: {fmt(totalIncome)}</div>}
            </div>
          </div>
        </div>

        <div className="plan-repeat-block">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={repeatOn}
              disabled={!canRepeat}
              onChange={(e) => setRepeatOn(e.target.checked)}
            />
            Repeat this plan
          </label>
          {!canRepeat && <p className="settings-desc">Set both a start and end date to enable repeating.</p>}
          {canRepeat && repeatOn && (
            <div className="seg plan-repeat-seg">
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
              When it repeats, the new budget will run for the same length of time as this one ({matchDays} day{matchDays === 1 ? "" : "s"}), starting {fmtDate(repeatPreview.next.startDate)} and ending {fmtDate(repeatPreview.next.endDate)}, carrying forward the same income and categories as a new plan.
            </p>
          )}
          {repeatCutoffWarning && (
            <p className="settings-desc inline-error">
              Warning: This budget is set to run for {matchDays} day{matchDays === 1 ? "" : "s"} (Ending on {fmtDate(endDate)}). Repeating {REPEAT_DUE_PHRASES[repeatFreq]} its start date means the next cycle begins on {fmtDate(repeatPreview.due)}. This budget will be cut off and end early.
            </p>
          )}
        </div>

        <div className="plan-summary-bar">
          <div><span className="muted">Income</span><strong>{fmt(totalIncome)}</strong></div>
          <div><span className="muted">Allocated</span><strong>{fmt(allocated)}</strong></div>
          <div>
            <span className="muted">Remaining</span>
            <strong className={remaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(remaining)}</strong>
          </div>
        </div>

        <div className="plan-categories">
          <div className="plan-categories-header">
            <div className="card-title" style={{ marginBottom: 0 }}>Budget categories</div>
          </div>
          {cats.length === 0 && (
            <p className="settings-desc">No categories yet - break your income down into spending buckets, like Rent or Groceries.</p>
          )}
          {cats.map((c, ci) => (
            <div
              key={c.id}
              className="plan-cat-block"
            >
              <div className="plan-cat-row">
                <div className="plan-cat-move-btns">
                  <button
                    type="button"
                    className="icon-btn plan-cat-move-btn"
                    title="Move category up"
                    aria-label="Move category up"
                    disabled={ci === 0}
                    onClick={() => moveCategory(c.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn plan-cat-move-btn"
                    title="Move category down"
                    aria-label="Move category down"
                    disabled={ci === cats.length - 1}
                    onClick={() => moveCategory(c.id, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <input className="input" placeholder="Category name (e.g. Streaming services)" value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} />
                <div className="seg plan-cat-seg">
                  <button type="button" className={`seg-btn ${c.mode !== "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "bulk" })}>Bulk</button>
                  <button type="button" className={`seg-btn ${c.mode === "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "items" })}>Itemized</button>
                </div>
                <button type="button" className="icon-btn" onClick={() => removeCategory(c.id)} aria-label="Remove category"><Trash2 size={14} /></button>
              </div>
              {c.mode === "items" ? (
                <div className="plan-items">
                  {(c.items || []).map((it) => (
                    <div key={it.id} className="plan-item-row">
                      <input className="input" placeholder="Expense (e.g. Netflix)" value={it.name} onChange={(e) => updateItem(c.id, it.id, { name: e.target.value })} />
                      <input type="date" className="input mono plan-item-date" title="Date (optional)" value={it.date || ""} onChange={(e) => updateItem(c.id, it.id, { date: e.target.value })} />
                      <input type="number" min="0" step="0.01" className="input mono plan-item-amount" placeholder="0.00" value={it.amount} onChange={(e) => updateItem(c.id, it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                      <button type="button" className="icon-btn" onClick={() => removeItem(c.id, it.id)} aria-label="Remove expense item"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="plan-items-footer">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem(c.id)}><Plus size={13} /> Add expense</button>
                    <div className="plan-cat-subtotal muted">Subtotal: {fmt(planCategoryTotal(c))}</div>
                  </div>
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group plan-cat-bulk">
                    <label>Budget amount</label>
                    <input type="number" min="0" step="0.01" className="input mono" placeholder="0.00" value={c.bulkAmount} onChange={(e) => updateCategory(c.id, { bulkAmount: e.target.value })} onWheel={blurOnWheel} />
                  </div>
                  <div className="form-group plan-cat-bulk">
                    <label>Date (optional)</label>
                    <input type="date" className="input mono" value={c.date || ""} onChange={(e) => updateCategory(c.id, { date: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm plan-add-category-btn" onClick={addCategory}><Plus size={14} /> Add category</button>
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
