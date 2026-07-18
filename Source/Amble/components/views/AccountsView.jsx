import React, { useState } from "react";
import {
  Wallet, Plus, Pencil, Trash2, AlertCircle
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { ACCOUNT_ICONS, ACCOUNT_LABELS } from "../../constants";
import { isDebtAccount, sortedAccountsList } from "../../state/accounts";
import { fmt } from "../../utils/format";

export function AccountsView({ accounts, balances, onAdd, onEdit, onDelete, onReorder, error }) {
  // Tracks the id of the account currently being dragged, so the card under the
  // cursor can be highlighted as a drop target.
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  if (accounts.length === 0) {
    return <EmptyState icon={Wallet} title="No accounts yet" message="Add a cash, bank, asset, credit card, or loan account to begin tracking balances." actionLabel="Add account" onAction={onAdd} />;
  }

  const sorted = sortedAccountsList(accounts);

  return (
    <div className="acc-view">
      {error && <div className="inline-error"><AlertCircle size={14} /> {error}</div>}
      <div className="acc-grid">
        {sorted.map((a) => {
          const Icon = ACCOUNT_ICONS[a.type];
          const bal = balances[a.id];
          const isDebt = isDebtAccount(a);
          return (
            <div
              key={a.id}
              className={`acc-card ${dragId === a.id ? "acc-card-dragging" : ""} ${overId === a.id && dragId && dragId !== a.id ? "acc-card-drop-target" : ""}`}
              draggable
              onDragStart={() => setDragId(a.id)}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); if (a.id !== overId) setOverId(a.id); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== a.id) onReorder(dragId, a.id);
                setDragId(null);
                setOverId(null);
              }}
            >
              <div className="acc-top">
                <div className="acc-icon" style={{ color: `var(--${isDebt ? "rust" : a.type === "savings" ? "brass" : "teal"})` }}><Icon size={20} /></div>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => onEdit(a)} aria-label="Edit account"><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => onDelete(a.id)} aria-label="Delete account"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="acc-name">{a.name}</div>
              <div className="acc-type">{ACCOUNT_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ""}</div>
              <div className={`acc-balance ${isDebt ? "tone-rust" : bal < 0 ? "tone-rust" : "tone-brass"}`}>
                {isDebt ? fmt(Math.max(0, -bal)) : fmt(bal)}
              </div>
              {(isDebt || a.interestRate != null) && (
                <div className="acc-sub muted">
                  {[isDebt ? "amount owed" : null, a.interestRate != null ? `${a.interestRate}% ${isDebt ? "APR" : "APY"}` : null].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
        <button className="acc-card acc-add" onClick={onAdd}>
          <Plus size={22} />
          <span>Add account</span>
        </button>
      </div>
    </div>
  );
}
