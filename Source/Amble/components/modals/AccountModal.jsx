import React, { useState } from "react";
import {
  Trash2, Archive, RotateCcw
} from "lucide-react";
import { Modal } from "../common/Modal";
import { blurOnWheel, uid } from "../../utils/misc";
import { isDebtAccount } from "../../state/accounts";

export function AccountModal({ initial, onSave, onClose, onDelete, onCloseAccount, onReopenAccount }) {
  const isEdit = !!initial.id;
  const isClosed = !!initial.closed;
  const [name, setName] = useState(initial.name || "");
  const [institution, setInstitution] = useState(initial.institution || "");
  const [type, setType] = useState(initial.type || "checking");
  const isDebt = isDebtAccount({ type });
  const existingDisplay = initial.id ? (isDebt ? Math.max(0, -(initial.startingBalance || 0)) : (initial.startingBalance || 0)) : "";
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
      startingBalance: isDebt ? -Math.abs(val) : val,
      interestRate: rateVal,
      order: typeof initial.order === "number" ? initial.order : undefined,
      closed: isClosed,
    });
  };

  return (
    <Modal title={isEdit ? (isClosed ? "Closed account" : "Edit account") : "Add account"} onClose={onClose}>
      <div className="modal-body">
        {isClosed && (
          <div className="tool-note">
            This account is closed and can't be selected for new transactions. Reopen it below to start using it again.
          </div>
        )}
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
            <option value="cash">Cash</option>
            <option value="asset">Asset</option>
            <option value="credit">Credit Card</option>
            <option value="loan">Loan</option>
          </select>
        </div>
        <div className="form-group">
          <label>{isDebt ? (isEdit ? "Starting balance owed" : "Current balance owed") : isEdit ? "Starting balance" : "Current balance"}</label>
          <input type="number" step="0.01" className="input mono" placeholder="0.00" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} onWheel={blurOnWheel} />
        </div>
        <div className="form-group">
          <label>{isDebt ? "APR (%)" : "Interest rate (%)"} <span className="muted">· optional</span></label>
          <input type="number" step="0.01" min="0" className="input mono" placeholder="e.g. 4.5" value={interestRateInput} onChange={(e) => setInterestRateInput(e.target.value)} onWheel={blurOnWheel} />
          <div className="tool-note">If set, compatible growth and payoff tools will use this automatically when you select this account.</div>
        </div>
        {isEdit && (
          isClosed ? (
            <button className="btn btn-ghost acc-action-btn" onClick={() => onReopenAccount(initial.id)}><RotateCcw size={14} /> Reopen account</button>
          ) : (
            <button className="btn btn-ghost acc-action-btn" onClick={() => onCloseAccount(initial.id)}><Archive size={14} /> Close account</button>
          )
        )}
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
