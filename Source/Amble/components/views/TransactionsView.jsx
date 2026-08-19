import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  Receipt, Trash2, ArrowRightLeft, Search, ListFilter, X
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { fmt, fmtDate } from "../../utils/format";

const SEARCH_DEBOUNCE_MS = 200;
const BATCH_SIZE = 50; // rows loaded/unloaded per scroll trigger
const MAX_MOUNTED = 150; // once the mounted window exceeds this, the trailing batch is dropped
const ESTIMATED_ROW_HEIGHT = 49; // px - stands in for unloaded rows' height in the spacer rows

function ColumnFilter({ label, active, open, onToggle, onClear, children }) {
  return (
    <div className="tx-column-filter">
      <button type="button" className={`tx-filter-trigger ${active ? "active" : ""}`} onClick={onToggle} aria-label={`Filter ${label}`} title={`Filter ${label}`}>
        <ListFilter size={14} />
      </button>
      {open && (
        <div className="tx-filter-menu">
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

// A single transaction row, memoized so scrolling/loading/unloading doesn't
// force a re-render of rows that aren't actually changing.
const TransactionRow = React.memo(function TransactionRow({ t, categoryMap, accountMap, onEdit, onDelete }) {
  const category = categoryMap.get(t.categoryId);
  const accountName = accountMap.get(t.accountId)?.name || "—";
  const toAccountName = accountMap.get(t.toAccountId)?.name || "—";
  const categoryName = category?.name || "Uncategorized";
  const categoryColor = category?.color || "var(--border)";

  return (
    <tr
      className="tx-row"
      tabIndex={0}
      onClick={() => { if (window.getSelection().toString()) return; onEdit(t); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(t); } }}
    >
      <td className="muted">{fmtDate(t.date)}</td>
      <td>{t.description || "—"}</td>
      <td>
        {t.type === "transfer" ? (
          <div className="pill-group">
            <span className="pill"><ArrowRightLeft size={12} /> {accountName} → {toAccountName}</span>
            {t.categoryId && <span className="pill" style={{ borderColor: categoryColor }}>{categoryName}</span>}
          </div>
        ) : <span className="pill" style={{ borderColor: categoryColor }}>{categoryName}</span>}
      </td>
      <td className="muted">{accountName}</td>
      <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>{t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}</td>
      <td className="row-actions-cell"><div className="row-actions"><button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} aria-label="Delete transaction"><Trash2 size={14} /></button></div></td>
    </tr>
  );
});

// A blank spacer row standing in for `count` unmounted rows above or below
// the current window, so the table's overall height (and therefore scroll
// position/scrollbar size) stays roughly correct even though those rows
// aren't actually in the DOM. Height is an estimate, not a measurement - see
// ESTIMATED_ROW_HEIGHT - so this is deliberately approximate rather than
// pixel-exact.
function SpacerRow({ count }) {
  if (count <= 0) return null;
  return (
    <tr aria-hidden="true" style={{ border: "none" }}>
      <td colSpan="6" style={{ height: count * ESTIMATED_ROW_HEIGHT, padding: 0, border: "none" }} />
    </tr>
  );
}

/* ---------------------------------- transactions view ---------------------------------- */
export function TransactionsView({ accounts, categories, transactions, onEdit, onAdd, onDelete, searchInputRef }) {
  const [search, setSearch] = useState("");
  // The raw `search` state updates on every keystroke so the input itself
  // stays responsive, but the expensive filter/sort pass below only reacts to
  // `debouncedSearch`, which settles ~200ms after typing stops.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const [openFilter, setOpenFilter] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ column: "date", direction: "desc" });

  // The mounted window into `filtered`: rows [windowStart, windowEnd) are
  // the only ones actually rendered as <tr> elements.
  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(BATCH_SIZE);

  // O(1) id -> record lookups, instead of catName/accName doing an
  // Array.find() scan on every call across every transaction.
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const catName = useCallback((id) => categoryMap.get(id)?.name || "Uncategorized", [categoryMap]);
  const accName = useCallback((id) => accountMap.get(id)?.name || "—", [accountMap]);

  const categoryFilterOptions = useMemo(() => {
    const parentIds = new Set(categories.filter((c) => c.parentCategoryId).map((c) => c.parentCategoryId));
    const names = new Set(categories.filter((c) => !parentIds.has(c.id)).map((c) => c.name));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories]);

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

  const orderById = useMemo(() => {
    const map = new Map();
    transactions.forEach((transaction, index) => map.set(transaction.id, index));
    return map;
  }, [transactions]);

  const filtered = useMemo(() => {
    const searchTerm = debouncedSearch.trim().toLowerCase();
    const hasDateFrom = !!filters.dateFrom;
    const hasDateTo = !!filters.dateTo;
    const hasDescription = !!filters.description;
    const descriptionTerm = hasDescription ? filters.description.toLowerCase() : "";
    const hasAmountMin = filters.amountMin !== "";
    const amountMin = hasAmountMin ? Number(filters.amountMin) : 0;
    const hasAmountMax = filters.amountMax !== "";
    const amountMax = hasAmountMax ? Number(filters.amountMax) : 0;

    // Single combined pass instead of seven chained .filter() calls - cuts
    // the constant factor on the O(n) work that's unavoidable on every
    // mount/tab-switch no matter how few rows end up rendered.
    const rows = transactions.filter((transaction) => {
      if (hasDateFrom && transaction.date < filters.dateFrom) return false;
      if (hasDateTo && transaction.date > filters.dateTo) return false;
      if (hasDescription && !(transaction.description || "").toLowerCase().includes(descriptionTerm)) return false;
      if (filters.type !== "all" && transaction.type !== filters.type) return false;
      if (filters.categoryId !== "all") {
        if (filters.categoryId === "transfer") {
          if (transaction.type !== "transfer") return false;
        } else if (filters.categoryId === "uncategorized") {
          if (transaction.categoryId || transaction.type === "transfer") return false;
        } else if (catName(transaction.categoryId) !== filters.categoryId) return false;
      }
      if (filters.accountId !== "all" && transaction.accountId !== filters.accountId && transaction.toAccountId !== filters.accountId) return false;
      if (hasAmountMin && transaction.amount < amountMin) return false;
      if (hasAmountMax && transaction.amount > amountMax) return false;
      if (searchTerm) {
        const haystack = [transaction.description, catName(transaction.categoryId), accName(transaction.accountId), accName(transaction.toAccountId), transaction.type];
        if (!haystack.filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm))) return false;
      }
      return true;
    });

    const valueFor = (transaction, column) => {
      if (column === "date") return transaction.date || "";
      if (column === "description") return (transaction.description || "").toLowerCase();
      if (column === "category") return transaction.type === "transfer"
        ? `${accName(transaction.accountId)} ${accName(transaction.toAccountId)}`.toLowerCase()
        : catName(transaction.categoryId).toLowerCase();
      if (column === "account") return accName(transaction.accountId).toLowerCase();
      return transaction.amount || 0;
    };
    return rows.sort((a, b) => {
      const first = valueFor(a, sort.column);
      const second = valueFor(b, sort.column);
      const result = typeof first === "number" ? first - second : String(first).localeCompare(String(second));
      if (result !== 0) return sort.direction === "asc" ? result : -result;
      // Tie (e.g. same date): fall back to insertion order so the most
      // recently added transaction surfaces first within the tied group,
      // rather than relying on sort stability (which would push it last).
      return orderById.get(b.id) - orderById.get(a.id);
    });
  }, [transactions, filters, debouncedSearch, sort, catName, accName, orderById]);

  // Whenever the matched set could change, snap the window back to the
  // start rather than leaving it wherever a previous, differently-sized
  // filtered set had scrolled to.
  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(BATCH_SIZE);
  }, [filters, debouncedSearch, sort]);

  const clampedEnd = Math.min(windowEnd, filtered.length);
  const visibleRows = useMemo(() => filtered.slice(windowStart, clampedEnd), [filtered, windowStart, clampedEnd]);
  const topSpacerCount = windowStart;
  const bottomSpacerCount = Math.max(0, filtered.length - clampedEnd);
  const canLoadMore = clampedEnd < filtered.length;
  const canLoadPrevious = windowStart > 0;

  // Bottom sentinel: scrolling down near it extends the window forward, and
  // if the mounted window has grown past MAX_MOUNTED, the leading batch is
  // dropped off the top so the mounted row count stays capped no matter how
  // far someone scrolls in one session.
  const bottomSentinelRef = useRef(null);
  useEffect(() => {
    if (!canLoadMore) return undefined;
    const node = bottomSentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setWindowEnd((end) => Math.min(filtered.length, end + BATCH_SIZE));
        setWindowStart((start) => {
          const newEnd = Math.min(filtered.length, windowEnd + BATCH_SIZE);
          return newEnd - start > MAX_MOUNTED ? start + BATCH_SIZE : start;
        });
      },
      { root: null, rootMargin: "600px 0px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadMore, filtered.length, windowEnd]);

  // Top sentinel: only relevant once some of the start has been unloaded.
  // Scrolling back up near it extends the window backward, dropping the
  // trailing batch off the bottom if the mounted window would otherwise
  // exceed MAX_MOUNTED.
  const topSentinelRef = useRef(null);
  useEffect(() => {
    if (!canLoadPrevious) return undefined;
    const node = topSentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setWindowStart((start) => Math.max(0, start - BATCH_SIZE));
        setWindowEnd((end) => {
          const newStart = Math.max(0, windowStart - BATCH_SIZE);
          return end - newStart > MAX_MOUNTED ? Math.max(newStart + BATCH_SIZE, end - BATCH_SIZE) : end;
        });
      },
      { root: null, rootMargin: "600px 0px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [canLoadPrevious, windowStart]);

  const setColumnSort = (column, direction) => setSort({ column, direction });
  const sortValue = (column) => sort.column === column ? sort.direction : "";

  const handleEdit = useCallback((t) => onEdit(t), [onEdit]);
  const handleDelete = useCallback((id) => onDelete(id), [onDelete]);

  // A click anywhere outside the open filter's own trigger/menu closes it.
  useEffect(() => {
    if (!openFilter) return;
    const handlePointerDown = (event) => {
      if (!event.target.closest(".tx-column-filter")) setOpenFilter(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openFilter]);

  if (accounts.length === 0) {
    return <EmptyState icon={Receipt} title="No accounts yet" message="Add an account first, then you can start logging transactions against it." />;
  }

  return (
    <div className="tx-view">
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

      <div className="card no-pad">
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
                  <label>Category / route</label><select className="select" value={filters.categoryId} onChange={(event) => updateFilter({ categoryId: event.target.value })}><option value="all">All categories and routes</option><option value="transfer">Transfers</option><option value="uncategorized">Uncategorized</option>{categoryFilterOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select>
                </ColumnFilter></div></th>
                <th><div className="tx-column-heading">Account<ColumnFilter label="Account" active={isColumnFiltered.account} open={openFilter === "account"} onToggle={() => setOpenFilter(openFilter === "account" ? null : "account")} onClear={() => clearFilter("account")}>
                  <label>Sort</label><select className="select" value={sortValue("account")} onChange={(event) => setColumnSort("account", event.target.value)}><option value="asc">A to Z</option><option value="desc">Z to A</option></select>
                  <label>Account</label><select className="select" value={filters.accountId} onChange={(event) => updateFilter({ accountId: event.target.value })}><option value="all">All accounts</option>{accounts.filter((account) => !account.closed || account.id === filters.accountId).map((account) => <option key={account.id} value={account.id}>{account.name}{account.closed ? " (Closed)" : ""}</option>)}</select>
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
              {visibleRows.length === 0 && filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="tx-filter-empty">
                    <strong>{transactions.length === 0 ? "It’s quiet." : "No transactions fit that filter."}</strong>
                    <span>{transactions.length === 0 ? "Add a transaction to get started." : "Adjust or clear a column filter to see more transactions."}</span>
                    {transactions.length === 0 && <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>Add transaction</button>}
                  </td>
                </tr>
              ) : (
                <>
                  <SpacerRow count={topSpacerCount} />
                  {canLoadPrevious && <tr ref={topSentinelRef} aria-hidden="true"><td colSpan="6" style={{ padding: 0, border: "none" }} /></tr>}
                  {visibleRows.map((t) => (
                    <TransactionRow
                      key={t.id}
                      t={t}
                      categoryMap={categoryMap}
                      accountMap={accountMap}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                  {canLoadMore && <tr ref={bottomSentinelRef} aria-hidden="true"><td colSpan="6" style={{ padding: 0, border: "none" }} /></tr>}
                  <SpacerRow count={bottomSpacerCount} />
                </>
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
