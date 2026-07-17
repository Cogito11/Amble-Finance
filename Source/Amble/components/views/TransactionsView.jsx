import React, { useState } from "react";
import {
  Receipt, Pencil, Trash2, ArrowRightLeft, Search
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { fmt, fmtDate } from "../../utils/format";
import { sortTransactionsNewestFirst } from "../../utils/misc";

/* ---------------------------------- transactions view ---------------------------------- */
export function TransactionsView({ accounts, categories, transactions, onEdit, onAdd, onDelete, searchInputRef }) {
  const [filter, setFilter] = useState({ accountId: "all", type: "all", search: "" });
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  const filtered = sortTransactionsNewestFirst(
    transactions
      .filter((t) => filter.accountId === "all" || t.accountId === filter.accountId || t.toAccountId === filter.accountId)
      .filter((t) => filter.type === "all" || t.type === filter.type)
      .filter((t) => !filter.search || (t.description || "").toLowerCase().includes(filter.search.toLowerCase()) || catName(t.categoryId).toLowerCase().includes(filter.search.toLowerCase()))
  );

  if (accounts.length === 0) {
    return <EmptyState icon={Receipt} title="No accounts yet" message="Add an account first, then you can start logging transactions against it." />;
  }

  return (
    <div className="tx-view">
      <div className="filter-bar">
        <div className="search-input">
          <Search size={15} />
          <input ref={searchInputRef} placeholder="Search description or category" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
        </div>
        <select className="select" value={filter.accountId} onChange={(e) => setFilter({ ...filter, accountId: e.target.value })}>
          <option value="all">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions found" message="Try a different filter, or add your first transaction." actionLabel="Add transaction" onAction={onAdd} />
      ) : (
        <div className="card no-pad">
          <table className="table full">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category / route</th><th>Account</th><th className="col-right">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtDate(t.date)}</td>
                  <td>{t.description || "—"}</td>
                  <td>
                    {t.type === "transfer" ? (
                      <div className="pill-group">
                        <span className="pill"><ArrowRightLeft size={12} /> {accName(t.accountId)} → {accName(t.toAccountId)}</span>
                        {t.categoryId && (
                          <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>
                    )}
                  </td>
                  <td className="muted">{accName(t.accountId)}</td>
                  <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>
                    {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}
                  </td>
                  <td className="row-actions-cell">
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit transaction"><Pencil size={14} /></button>
                      <button className="icon-btn" onClick={() => onDelete(t.id)} aria-label="Delete transaction"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
