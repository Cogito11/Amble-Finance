import React, { useState } from "react";
import {
  Trash2
} from "lucide-react";
import { Modal } from "../common/Modal";
import { blurOnWheel, uid } from "../../utils/misc";

export function GoalModal({ initial, accounts, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [targetAmount, setTargetAmount] = useState(initial.targetAmount ?? "");
  const [targetDate, setTargetDate] = useState(initial.targetDate || "");
  const [trackingMode, setTrackingMode] = useState(initial.trackingMode || "account");
  const openAccounts = accounts.filter((a) => !a.closed);
  const [accountId, setAccountId] = useState(initial.accountId || openAccounts[0]?.id || accounts[0]?.id || "");
  const [manualAmount, setManualAmount] = useState(initial.manualAmount ?? "");
  const [notes, setNotes] = useState(initial.notes || "");

  const canSave = name.trim().length > 0 && targetAmount && parseFloat(targetAmount) > 0 && (trackingMode !== "account" || accountId);

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      targetAmount: Math.abs(parseFloat(targetAmount)),
      targetDate: targetDate || null,
      trackingMode,
      accountId: trackingMode === "account" ? accountId : null,
      manualAmount: trackingMode === "manual" ? (parseFloat(manualAmount) || 0) : 0,
      notes: notes.trim(),
      dateCreated: initial.dateCreated || new Date().toISOString(),
    });
  };

  return (
    <Modal title={isEdit ? "Edit goal" : "New goal"} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>Goal name</label>
          <input className="input" placeholder="e.g. Emergency fund, Vacation" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Target amount</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} onWheel={blurOnWheel} />
          </div>
          <div className="form-group">
            <label>Target date <span className="muted">· optional</span></label>
            <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Track progress with</label>
          <div className="seg">
            <button className={`seg-btn ${trackingMode === "account" ? "active" : ""}`} onClick={() => setTrackingMode("account")}>An account balance</button>
            <button className={`seg-btn ${trackingMode === "manual" ? "active" : ""}`} onClick={() => setTrackingMode("manual")}>Manual updates</button>
          </div>
        </div>
        {trackingMode === "account" ? (
          <div className="form-group">
            <label>Account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.filter((a) => !a.closed || a.id === accountId).map((a) => <option key={a.id} value={a.id}>{a.name}{a.closed ? " (Closed)" : ""}</option>)}
            </select>
            <div className="tool-note">Progress tracks this account's current balance against your target. Best for a goal that lives in its own savings account.</div>
          </div>
        ) : (
          <div className="form-group">
            <label>Current amount saved</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} onWheel={blurOnWheel} />
            <div className="tool-note">You'll update this yourself as you save - useful for a goal that isn't tied to one specific account.</div>
          </div>
        )}
        <div className="form-group">
          <label>Notes <span className="muted">· optional</span></label>
          <input className="input" placeholder="What's this for?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save goal</button>
        </div>
      </div>
    </Modal>
  );
}
