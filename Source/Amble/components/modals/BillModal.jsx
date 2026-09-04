import React, { useState } from "react";
import {
  Trash2
} from "lucide-react";
import { Modal } from "../common/Modal";
import { blurOnWheel, uid } from "../../utils/misc";
import { todayStr } from "../../utils/dates";

export function BillModal({ initial, accounts, categories, budgets, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [type, setType] = useState(initial.type || "expense");
  const [amount, setAmount] = useState(initial.amount ?? "");
  const openAccounts = accounts.filter((a) => !a.closed);
  const [accountId, setAccountId] = useState(initial.accountId || openAccounts[0]?.id || accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(initial.categoryId || "");
  const [dueDate, setDueDate] = useState(initial.dueDate || todayStr());
  const [recurring, setRecurring] = useState(initial.recurring ?? false);
  const [frequency, setFrequency] = useState(initial.frequency || "monthly");
  const [hasEndDate, setHasEndDate] = useState(!!initial.endDate);
  const [endDate, setEndDate] = useState(initial.endDate || "");
  const [notes, setNotes] = useState(initial.notes || "");

  // A category mirrored from a budget (planId set) should only be selectable
  // while that budget is the active one - same rule TransactionModal applies.
  // A bill already pointing at a category from a since-deactivated budget still
  // shows it (so editing an older bill doesn't silently lose its category name),
  // but it can't be newly picked for anything else.
  const activeBudgetId = (budgets || []).find((b) => b.active)?.id;
  const isSelectable = (c) => !c.planId || c.planId === activeBudgetId;

  const parentCategories = categories.filter((c) => c.type === type && !c.parentCategoryId && (isSelectable(c) || c.id === categoryId));

  const canSave = name.trim().length > 0 && amount && parseFloat(amount) > 0 && accountId && dueDate;

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      type,
      amount: Math.abs(parseFloat(amount)),
      accountId,
      categoryId: categoryId || null,
      dueDate,
      recurring,
      frequency: recurring ? frequency : null,
      endDate: recurring && hasEndDate && endDate ? endDate : null,
      notes: notes.trim(),
      completions: initial.completions || {},
    });
  };

  return (
    <Modal title={isEdit ? "Edit bill" : "New bill"} onClose={onClose}>
      <div className="modal-body">
        <div className="seg">
          {["expense", "income"].map((t) => (
            <button key={t} className={`seg-btn ${type === t ? "active" : ""}`} onClick={() => { setType(t); setCategoryId(""); }}>{t}</button>
          ))}
        </div>
        <div className="form-group">
          <label>Name</label>
          <input className="input" placeholder="e.g. Rent, Netflix, Paycheck" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={blurOnWheel} />
          </div>
          <div className="form-group">
            <label>{recurring ? "First due date" : "Due date"}</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.filter((a) => !a.closed || a.id === accountId).map((a) => <option key={a.id} value={a.id}>{a.name}{a.closed ? " (Closed)" : ""}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeats
        </label>
        {recurring && (
          <>
            <div className="form-group">
              <label>Frequency</label>
              <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
              Stop repeating after a date
            </label>
            {hasEndDate && (
              <div className="form-group">
                <label>End date</label>
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </>
        )}
        <div className="form-group">
          <label>Notes <span className="muted">· optional</span></label>
          <input className="input" placeholder="e.g. Autopay on the 3rd" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save bill</button>
        </div>
      </div>
    </Modal>
  );
}
