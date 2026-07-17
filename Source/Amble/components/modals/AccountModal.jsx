import React, { useState } from "react";
import {
  Trash2
} from "lucide-react";
import { Modal } from "../common/Modal";
import { blurOnWheel, uid } from "../../utils/misc";

export function AccountModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [institution, setInstitution] = useState(initial.institution || "");
  const [type, setType] = useState(initial.type || "checking");
  const isCredit = type === "credit";
  const existingDisplay = initial.id ? (isCredit ? Math.max(0, -(initial.startingBalance || 0)) : (initial.startingBalance || 0)) : "";
  const [balanceInput, setBalanceInput] = useState(existingDisplay);
  const [interestRateInput, setInterestRateInput] = useState(initial.interestRate ?? "");

  const canSave = name.trim().length > 0 && balanceInput !== "";

  const submit = () => {
    if (!canSave) return;
    const val = parseFloat(balanceInput) || 0;
    const rateVal = interestRateInput === "" ? null : Math.max(0, parseFloat(interestRateInput) || 0);
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      institution: institution.trim(),
      type,
      startingBalance: isCredit ? -Math.abs(val) : val,
      interestRate: rateVal,
      order: typeof initial.order === "number" ? initial.order : undefined,
    });
  };

  return (
    <Modal title={isEdit ? "Edit account" : "Add account"} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>Account name</label>
          <input className="input" placeholder="e.g. Everyday Checking" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Institution</label>
          <input className="input" placeholder="e.g. Chase, Ally, Amex" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Account type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="credit">Credit Card</option>
          </select>
        </div>
        <div className="form-group">
          <label>{isCredit ? (isEdit ? "Starting balance owed" : "Current balance owed") : isEdit ? "Starting balance" : "Current balance"}</label>
          <input type="number" step="0.01" className="input mono" placeholder="0.00" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} onWheel={blurOnWheel} />
        </div>
        <div className="form-group">
          <label>{isCredit ? "APR (%)" : "Interest rate (%)"} <span className="muted">· optional</span></label>
          <input type="number" step="0.01" min="0" className="input mono" placeholder="e.g. 4.5" value={interestRateInput} onChange={(e) => setInterestRateInput(e.target.value)} onWheel={blurOnWheel} />
          <div className="tool-note">If set, tools like the compound interest and debt payoff calculators will use this automatically when you select this account.</div>
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save account</button>
        </div>
      </div>
    </Modal>
  );
}
