import React, { useState, useEffect } from "react";
import {
  Trash2
} from "lucide-react";
import { Modal } from "../common/Modal";
import { todayStr } from "../../utils/dates";
import { blurOnWheel, uid } from "../../utils/misc";

/* ---------------------------------- modals ---------------------------------- */
export function TransactionModal({ initial, accounts, categories, plans, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [type, setType] = useState(initial.type || "expense");
  const [date, setDate] = useState(initial.date || todayStr());
  const [description, setDescription] = useState(initial.description || "");
  const [amount, setAmount] = useState(initial.amount ?? "");
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initial.toAccountId || "");
  const [categoryId, setCategoryId] = useState(initial.categoryId || "");

  // A category that's mirrored from a budget (planId set) should only be pickable
  // while that budget is the active one - once a budget is deactivated its
  // categories stay in state (so existing transactions still resolve their name),
  // but they shouldn't keep showing up as choices for new/edited transactions.
  const activePlanId = (plans || []).find((p) => p.active)?.id;
  const isSelectable = (c) => !c.planId || c.planId === activePlanId;

  // Top-level categories selectable for this transaction type. Transfers aren't
  // inherently income or expense, so any top-level category can be used to tag them.
  const parentCategories = categories.filter((c) => (type === "transfer" ? true : c.type === type) && !c.parentCategoryId && isSelectable(c));
  // The currently selected category might itself be a specific expense (a sub-category);
  // resolve which parent it belongs to so both dropdowns stay in sync.
  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const selectedParentId = selectedCategory ? (selectedCategory.parentCategoryId || selectedCategory.id) : "";
  const subCategories = selectedParentId ? categories.filter((c) => c.parentCategoryId === selectedParentId) : [];

  // "General <parent>" isn't a selectable specific expense - if the chosen category has
  // sub-items, the transaction must point at one of them, so default to the first as soon
  // as the current selection isn't one (e.g. right after picking a parent that has items).
  useEffect(() => {
    if (subCategories.length > 0 && !subCategories.some((c) => c.id === categoryId)) {
      setCategoryId(subCategories[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentId, subCategories.length]);

  // If the transaction type changes (e.g. expense -> income) after a category was
  // already picked, that category may no longer be valid for the new type (income
  // categories shouldn't end up on expense transactions and vice versa). Clear it so
  // the dropdown falls back to "Uncategorized" instead of silently saving a mismatched,
  // now-invisible category selection.
  useEffect(() => {
    if (!categoryId || type === "transfer") return;
    const cat = categories.find((c) => c.id === categoryId);
    const parent = cat ? (cat.parentCategoryId ? categories.find((c) => c.id === cat.parentCategoryId) : cat) : null;
    if (!parent || parent.type !== type) setCategoryId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const canSave = amount && parseFloat(amount) > 0 && accountId && (type !== "transfer" || (toAccountId && toAccountId !== accountId));

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      type, date, description: description.trim(),
      amount: Math.abs(parseFloat(amount)),
      accountId,
      toAccountId: type === "transfer" ? toAccountId : null,
      categoryId: categoryId || null,
    });
  };

  return (
    <Modal title={isEdit ? "Edit transaction" : "Add transaction"} onClose={onClose}>
      <div className="modal-body">
        <div className="seg">
          {["expense", "income", "transfer"].map((t) => (
            <button key={t} className={`seg-btn ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={blurOnWheel} />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input className="input" placeholder="e.g. Trader Joe's" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{type === "transfer" ? "From account" : "Account"}</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {type === "transfer" ? (
            <div className="form-group">
              <label>To account</label>
              <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select account</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Category</label>
              <select className="select" value={selectedParentId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {type === "transfer" && (
          <div className="form-group">
            <label>Category (optional)</label>
            <select className="select" value={selectedParentId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {subCategories.length > 0 && (
          <div className="form-group">
            <label>Specific expense</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save transaction</button>
        </div>
      </div>
    </Modal>
  );
}
