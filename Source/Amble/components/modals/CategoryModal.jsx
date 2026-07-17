import React, { useState } from "react";
import {
  Trash2
} from "lucide-react";
import { Modal } from "../common/Modal";
import { CAT_PALETTE } from "../../state/categories";
import { blurOnWheel, uid } from "../../utils/misc";

export function CategoryModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [type, setType] = useState(initial.type || "expense");
  const [limit, setLimit] = useState(initial.limit ?? "");

  const canSave = name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      type,
      limit: type === "expense" ? (parseFloat(limit) || 0) : 0,
      color: initial.color || CAT_PALETTE[Math.floor(Math.random() * CAT_PALETTE.length)],
      planId: initial.planId ?? null,
    });
  };

  return (
    <Modal title={isEdit ? "Edit category" : "Add category"} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>Category name</label>
          <input className="input" placeholder="e.g. Pet Care" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        {type === "expense" && (
          <div className="form-group">
            <label>Monthly budget limit</label>
            <input type="number" min="0" step="1" className="input mono" placeholder="0.00" value={limit} onChange={(e) => setLimit(e.target.value)} onWheel={blurOnWheel} />
          </div>
        )}
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save category</button>
        </div>
      </div>
    </Modal>
  );
}
