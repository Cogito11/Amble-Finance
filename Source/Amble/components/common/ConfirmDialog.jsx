import React from "react";
import {
  X, Trash2
} from "lucide-react";

export function ConfirmDialog({ title, message, confirmLabel = "Delete", tone = "danger", hideCancel = false, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="modal-footer" style={{ justifyContent: "flex-end", gap: 8 }}>
          {!hideCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
          <button className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {tone === "danger" && <Trash2 size={14} />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
