import React, { useMemo, useState } from "react";
import {
  Receipt, Pencil, Trash2, ArrowRightLeft, Search, ListFilter, X
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { fmt, fmtDate } from "../../utils/format";

function ColumnFilter({ label, active, open, onToggle, onClear, children }) {
  return (
    <div className="tx-column-filter">
      <button type="button" className={`tx-filter-trigger ${active ? "active" : ""}`} onClick={onToggle} aria-label={`Filter ${label}`} title={`Filter ${label}`}>
        <ListFilter size={14} />
      </button>
      {open && (
        <div className="tx-filter-menu" onClick={(event) => event.stopPropagation()}>
          <div className="tx-filter-menu-title">
            <span>{label}</span>
            {active && <button type="button" className="icon-btn" onClick={onClear} title="Clear filter" aria-label={`Clear ${label} filter`}><X size={13} /></button>}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

const DEFAULT_FILTERS = {
  dateFrom: "", dateTo: "", description: "", categoryId: "all", type: "all",
  accountId: "all", amountMin: "", amountMax: "",
};

/* ---------------------------------- transactions view ---------------------------------- */
export function TransactionsView({ accounts, categories, transactions, onEdit, onAdd, onDelete, searchInputRef }) {
  const [search, setSearch] = useState("");
  const [openFilter, setOpenFilter] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ column: "date", direction: "desc" });
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const updateFilter = (patch) => setFilters((current) => ({ ...current, ...patch }));
  const clearFilter = (column) => {
    const reset = {
      date: { dateFrom: "", dateTo: "" },
      description: { description: "" },
      category: { categoryId: "all", type: "all" },
      account: { accountId: "all" },
      amount: { amountMin: "", amountMax: "" },
    };
    updateFilter(reset[column]);
  };
  const isColumnFiltered = {
    date: !!(filters.dateFrom || filters.dateTo),
    description: !!filters.description,
    category: filters.categoryId !== "all" || filters.type !== "all",
    account: filters.accountId !== "all",
    amount: filters.amountMin !== "" || filters.amountMax !== "",
  };
  const isAnyFiltered = Object.values(isColumnFiltered).some(Boolean);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const rows = transactions
      .filter((transaction) => !filters.dateFrom || transaction.date >= filters.dateFrom)
      .filter((transaction) => !filters.dateTo || transaction.date <= filters.dateTo)
      .filter((transaction) => !filters.description || (transaction.description || "").toLowerCase().includes(filters.description.toLowerCase()))
      .filter((transaction) => filters.type === "all" || transaction.type === filters.type)
      .filter((transaction) => {
        if (filters.categoryId === "all") return true;
        if (filters.categoryId === "transfer") return transaction.type === "transfer";
        if (filters.categoryId === "uncategorized") return !transaction.categoryId && transaction.type !== "transfer";
        return transaction.categoryId === filters.categoryId;
      })
      .filter((transaction) => filters.accountId === "all" || transaction.accountId === filters.accountId || transaction.toAccountId === filters.accountId)
      .filter((transaction) => filters.amountMin === "" || transaction.amount >= Number(filters.amountMin))
      .filter((transaction) => filters.amountMax === "" || transaction.amount <= Number(filters.amountMax))
      .filter((transaction) => !searchTerm || [transaction.description, catName(transaction.categoryId), accName(transaction.accountId), accName(transaction.toAccountId), transaction.type]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm)));

    const valueFor = (transaction, column) => {
      if (column === "date") return transaction.date || "";
      if (column === "description") return (transaction.description || "").toLowerCase();
      if (column === "category") return transaction.type === "transfer"
        ? `${accName(transaction.accountId)} ${accName(transaction.toAccountId)}`.toLowerCase()
        : catName(transaction.categoryId).toLowerCase();
      if (column === "account") return accName(transaction.accountId).toLowerCase();
      return transaction.amount || 0;
    };
    return [...rows].sort((a, b) => {
      const first = valueFor(a, sort.column);
      const second = valueFor(b, sort.column);
      const result = typeof first === "number" ? first - second : String(first).localeCompare(String(second));
      return sort.direction === "asc" ? result : -result;
    });
  }, [transactions, filters, search, sort, accounts, categories]);

  const setColumnSort = (column, direction) => setSort({ column, direction });
  const sortValue = (column) => sort.column === column ? sort.direction : "";

  if (accounts.length === 0) {
    return <EmptyState icon={Receipt} title="No accounts yet" message="Add an account first, then you can start logging transactions against it." />;
  }

  return (
    <div className="tx-view" onClick={() => openFilter && setOpenFilter(null)}>
      <div className="filter-bar">
        <div className="search-input">
          <Search size={15} />
          <input ref={searchInputRef} placeholder="Search all transactions" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {isAnyFiltered && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
            <X size={13} /> Reset filters
          </button>
        )}
      </div>

      <div className={`card no-pad${filtered.length === 0 ? " tx-empty" : ""}`}>
          <table className="table full">
            <thead>
              <tr>
                <th><div className="tx-column-heading">Date<ColumnFilter label="Date" active={isColumnFiltered.date} open={openFilter === "date"} onToggle={() => setOpenFilter(openFilter === "date" ? null : "date")} onClear={() => clearFilter("date")}>
                  <label>Sort</label><select className="select" value={sortValue("date")} onChange={(event) => setColumnSort("date", event.target.value)}><option value="desc">Newest to oldest</option><option value="asc">Oldest to newest</option></select>
                  <label>From</label><input className="input" type="date" value={filters.dateFrom} onChange={(event) => updateFilter({ dateFrom: event.target.value })} />
                  <label>To</label><input className="input" type="date" value={filters.dateTo} onChange={(event) => updateFilter({ dateTo: event.target.value })} />
                </ColumnFilter></div></th>
                <th><div className="tx-column-heading">Description<ColumnFilter label="Description" active={isColumnFiltered.description} open={openFilter === "description"} onToggle={() => setOpenFilter(openFilter === "description" ? null : "description")} onClear={() => clearFilter("description")}>
                  <label>Sort</label><select className="select" value={sortValue("description")} onChange={(event) => setColumnSort("description", event.target.value)}><option value="asc">A to Z</option><option value="desc">Z to A</option></select>
                  <label>Contains</label><input className="input" value={filters.description} placeholder="Search description" onChange={(event) => updateFilter({ description: event.target.value })} />
                </ColumnFilter></div></th>
                <th><div className="tx-column-heading">Category / route<ColumnFilter label="Category / route" active={isColumnFiltered.category} open={openFilter === "category"} onToggle={() => setOpenFilter(openFilter === "category" ? null : "category")} onClear={() => clearFilter("category")}>
                  <label>Sort</label><select className="select" value={sortValue("category")} onChange={(event) => setColumnSort("category", event.target.value)}><option value="asc">A to Z</option><option value="desc">Z to A</option></select>
                  <label>Transaction type</label><select className="select" value={filters.type} onChange={(event) => updateFilter({ type: event.target.value })}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select>
                  <label>Category / route</label><select className="select" value={filters.categoryId} onChange={(event) => updateFilter({ categoryId: event.target.value })}><option value="all">All categories and routes</option><option value="transfer">Transfers</option><option value="uncategorized">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.parentCategoryId ? `↳ ${category.name}` : category.name}</option>)}</select>
                </ColumnFilter></div></th>
                <th><div className="tx-column-heading">Account<ColumnFilter label="Account" active={isColumnFiltered.account} open={openFilter === "account"} onToggle={() => setOpenFilter(openFilter === "account" ? null : "account")} onClear={() => clearFilter("account")}>
                  <label>Sort</label><select className="select" value={sortValue("account")} onChange={(event) => setColumnSort("account", event.target.value)}><option value="asc">A to Z</option><option value="desc">Z to A</option></select>
                  <label>Account</label><select className="select" value={filters.accountId} onChange={(event) => updateFilter({ accountId: event.target.value })}><option value="all">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
                </ColumnFilter></div></th>
                <th className="col-right"><div className="tx-column-heading tx-column-heading-right">Amount<ColumnFilter label="Amount" active={isColumnFiltered.amount} open={openFilter === "amount"} onToggle={() => setOpenFilter(openFilter === "amount" ? null : "amount")} onClear={() => clearFilter("amount")}>
                  <label>Sort</label><select className="select" value={sortValue("amount")} onChange={(event) => setColumnSort("amount", event.target.value)}><option value="desc">High to low</option><option value="asc">Low to high</option></select>
                  <label>Minimum amount</label><input className="input" type="number" min="0" value={filters.amountMin} onChange={(event) => updateFilter({ amountMin: event.target.value })} />
                  <label>Maximum amount</label><input className="input" type="number" min="0" value={filters.amountMax} onChange={(event) => updateFilter({ amountMax: event.target.value })} />
                </ColumnFilter></div></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="tx-filter-empty">
                    <strong>{transactions.length === 0 ? "It’s quiet." : "No transactions fit that filter."}</strong>
                    <span>{transactions.length === 0 ? "Add a transaction to get started." : "Adjust or clear a column filter to see more transactions."}</span>
                    {transactions.length === 0 && <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>Add transaction</button>}
                  </td>
                </tr>
              ) : filtered.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtDate(t.date)}</td>
                  <td>{t.description || "—"}</td>
                  <td>
                    {t.type === "transfer" ? (
                      <div className="pill-group">
                        <span className="pill"><ArrowRightLeft size={12} /> {accName(t.accountId)} → {accName(t.toAccountId)}</span>
                        {t.categoryId && <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>}
                      </div>
                    ) : <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>}
                  </td>
                  <td className="muted">{accName(t.accountId)}</td>
                  <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>{t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}</td>
                  <td className="row-actions-cell"><div className="row-actions"><button className="icon-btn" onClick={() => onEdit(t)} aria-label="Edit transaction"><Pencil size={14} /></button><button className="icon-btn" onClick={() => onDelete(t.id)} aria-label="Delete transaction"><Trash2 size={14} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}
