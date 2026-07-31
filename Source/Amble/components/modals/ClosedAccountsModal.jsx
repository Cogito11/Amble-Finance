import React from "react";
import { RotateCcw, Pencil, Archive } from "lucide-react";
import { Modal } from "../common/Modal";
import { ACCOUNT_ICONS, ACCOUNT_LABELS } from "../../constants";
import { isDebtAccount } from "../../state/accounts";
import { fmt } from "../../utils/format";

/* ---------------------------------- closed accounts modal ---------------------------------- */
export function ClosedAccountsModal({ accounts, balances, onReopen, onEdit, onClose }) {
  return (
    <Modal title="Closed accounts" onClose={onClose}>
      <div className="modal-body">
        {accounts.length === 0 ? (
          <p className="settings-desc">
            You don't have any closed accounts. When you close an account it'll show up here so you
            can reopen it later, and its history stays intact the whole time.
          </p>
        ) : (
          <>
            <p className="settings-desc">
              Closed accounts are hidden from new transactions but keep their full history. Reopen
              one to start using it again, or edit it to change its details or delete it.
            </p>
            <div className="closed-acc-list">
              {accounts.map((a) => {
                const Icon = ACCOUNT_ICONS[a.type] || Archive;
                const bal = balances[a.id] || 0;
                const isDebt = isDebtAccount(a);
                const displayBal = isDebt ? Math.max(0, -bal) : bal;
                return (
                  <div key={a.id} className="closed-acc-card">
                    <div className="closed-acc-top">
                      <div className="closed-acc-identity">
                        <div className="acc-icon" style={{ color: `var(--${isDebt ? "rust" : a.type === "savings" ? "brass" : "teal"})` }}>
                          <Icon size={18} />
                        </div>
                        <div className="closed-acc-text">
                          <div className="closed-acc-name">{a.name}</div>
                          <div className="closed-acc-type">{ACCOUNT_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ""}</div>
                        </div>
                      </div>
                      <button className="icon-btn" title="Edit account" aria-label="Edit account" onClick={() => onEdit(a)}>
                        <Pencil size={14} />
                      </button>
                    </div>
                    <div className="closed-acc-bottom">
                      <span className={`closed-acc-balance ${isDebt || bal < 0 ? "tone-rust" : "tone-brass"}`}>{fmt(displayBal)}</span>
                      <button className="btn btn-primary btn-sm" onClick={() => onReopen(a.id)}>
                        <RotateCcw size={14} /> Reopen Account
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
