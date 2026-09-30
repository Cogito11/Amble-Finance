import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  Receipt, Trash2, ArrowRightLeft, Search, ListFilter, X
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { fmt, fmtDate } from "../../utils/format";

const SEARCH_DEBOUNCE_MS = 200;
const DEFAULT_ROW_HEIGHT = 49; // px - only used until real rows have been measured; after that the running average of measured rows stands in for unmeasured ones
const OVERSCAN_ROWS = 25; // rows kept mounted above/below the actual viewport as a scroll buffer
const HYSTERESIS_ROWS = 10; // the window is only rebuilt once the viewport gets within this many rows of its edge, so a row sitting right on the boundary can't flip in and out every frame

// Nearest ancestor that actually scrolls (null = the page itself scrolls).
function getScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

// offsets[i] = top of row i (px from the top of the table body), offsets[n] = total height.
// Rows that have been measured use their real height; the rest use `fallback`.
function buildOffsets(rows, heights, fallback) {
  const offsets = new Array(rows.length + 1);
  let y = 0;
  for (let i = 0; i < rows.length; i++) {
    offsets[i] = y;
    y += heights.get(rows[i].id) ?? fallback;
  }
  offsets[rows.length] = y;
  return offsets;
}

// Index of the row containing vertical position y (binary search).
function indexAtOffset(offsets, y) {
  let lo = 0;
  let hi = offsets.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
  }
  return lo;
}

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
      data-tx-id={String(t.id)}
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

// A blank spacer row standing in for the unmounted rows above or below the
// current window. Its height is the sum of those rows' measured heights (or
// the running average for rows never seen yet), so unmounting a tall row
// leaves a gap of exactly that row's height and nothing shifts.
function SpacerRow({ height }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true">
      <td colSpan="6" style={{ height, padding: 0, border: "none" }} />
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
  // the only ones actually rendered as <tr> elements. Unlike the previous
  // batch/sentinel version, this is recomputed directly from scroll
  // position on every scroll event (see the effect below) rather than
  // waiting for a trigger element to cross into view - so fast scrolling
  // can't outrun it and leave a blank gap.
  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(OVERSCAN_ROWS * 2);

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

  // ---- variable-height windowing -------------------------------------------
  // Real row heights are measured after render and cached by transaction id.
  // Unmeasured rows are assumed to be the average measured height.
  const heightsRef = useRef(new Map());
  const heightStatsRef = useRef({ sum: 0, count: 0 });
  const [layoutVersion, setLayoutVersion] = useState(0);

  const offsets = useMemo(() => {
    const { sum, count } = heightStatsRef.current;
    return buildOffsets(filtered, heightsRef.current, count ? sum / count : DEFAULT_ROW_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, layoutVersion]);

  const clampedStart = Math.min(windowStart, filtered.length);
  const clampedEnd = Math.min(windowEnd, filtered.length);
  const visibleRows = useMemo(() => filtered.slice(clampedStart, clampedEnd), [filtered, clampedStart, clampedEnd]);
  const topSpacerHeight = offsets[clampedStart];
  const bottomSpacerHeight = offsets[filtered.length] - offsets[clampedEnd];

  // Latest values for the scroll handlers, which are created once.
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const windowRef = useRef({ start: 0, end: 0 });
  windowRef.current = { start: clampedStart, end: clampedEnd };

  const bodyRef = useRef(null);
  const scrollParentRef = useRef(undefined); // undefined = not yet detected, null = page scrolls
  const anchorRef = useRef(null);
  const widthRef = useRef(null);

  const resolveScrollParent = useCallback(() => {
    if (scrollParentRef.current === undefined && bodyRef.current) scrollParentRef.current = getScrollParent(bodyRef.current);
    return scrollParentRef.current ?? null;
  }, []);

  const readScroll = useCallback(() => {
    const parent = resolveScrollParent();
    return parent
      ? { top: parent.scrollTop, edge: parent.getBoundingClientRect().top }
      : { top: window.scrollY, edge: 0 };
  }, [resolveScrollParent]);

  const writeScrollTop = useCallback((value) => {
    const parent = resolveScrollParent();
    if (parent) parent.scrollTop = value; else window.scrollTo({ top: value });
  }, [resolveScrollParent]);

  // Remembers which row is at the top of the viewport and where. After any
  // render that changes the layout above it (rows mounting at their real
  // height, spacer estimates being refined), the layout effect below nudges
  // scrollTop so that row is back where the user last saw it.
  const captureAnchor = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const { top, edge } = readScroll();
    for (const row of body.children) {
      const id = row.dataset?.txId;
      if (id === undefined) continue;
      const rect = row.getBoundingClientRect();
      if (rect.bottom > edge) {
        anchorRef.current = { id, offset: rect.top - edge, scrollTop: top, filtered: filteredRef.current };
        return;
      }
    }
    anchorRef.current = null;
  }, [readScroll]);

  // Works out which rows should be mounted for the current scroll position.
  const recalcWindow = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    const scrollParent = resolveScrollParent();

    let tableTop, viewTop, viewBottom;
    if (scrollParent) {
      const nodeRect = node.getBoundingClientRect();
      const parentRect = scrollParent.getBoundingClientRect();
      tableTop = nodeRect.top - parentRect.top + scrollParent.scrollTop;
      viewTop = scrollParent.scrollTop;
      viewBottom = viewTop + scrollParent.clientHeight;
    } else {
      tableTop = node.getBoundingClientRect().top + window.scrollY;
      viewTop = window.scrollY;
      viewBottom = viewTop + window.innerHeight;
    }

    captureAnchor();

    const rowOffsets = offsetsRef.current;
    const count = rowOffsets.length - 1;
    const first = indexAtOffset(rowOffsets, viewTop - tableTop);
    const last = indexAtOffset(rowOffsets, viewBottom - tableTop);

    // Hysteresis: if the current window still covers the viewport plus a
    // margin, leave it alone. Without this, a row sitting right on the
    // window boundary could mount and unmount on consecutive frames.
    const current = windowRef.current;
    const needStart = Math.max(0, first - HYSTERESIS_ROWS);
    const needEnd = Math.min(count, last + 1 + HYSTERESIS_ROWS);
    if (current.start <= needStart && current.end >= needEnd && current.end <= count) return;

    const nextStart = Math.max(0, first - OVERSCAN_ROWS);
    const nextEnd = Math.min(count, last + 1 + OVERSCAN_ROWS);
    setWindowStart((value) => (value === nextStart ? value : nextStart));
    setWindowEnd((value) => (value === nextEnd ? value : nextEnd));
  }, [resolveScrollParent, captureAnchor]);

  // After every layout-affecting render: (1) undo any visible shift, (2)
  // measure the rows that are mounted and remember their real heights.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;

    const anchor = anchorRef.current;
    if (anchor && anchor.filtered === filtered) {
      const el = body.querySelector(`[data-tx-id="${CSS.escape(anchor.id)}"]`);
      if (el) {
        const { top, edge } = readScroll();
        const expected = anchor.offset - (top - anchor.scrollTop);
        const drift = (el.getBoundingClientRect().top - edge) - expected;
        if (Math.abs(drift) > 0.5) writeScrollTop(top + drift);
      }
    }

    const rowEls = body.querySelectorAll("tr[data-tx-id]");
    if (rowEls.length === visibleRows.length) {
      const heights = heightsRef.current;
      const stats = heightStatsRef.current;
      const tops = Array.from(rowEls, (el) => el.getBoundingClientRect());
      let changed = false;
      for (let i = 0; i < rowEls.length; i++) {
        // Distance to the next row's top (or own height for the last one)
        // so fractional pixels and collapsed borders can't accumulate error.
        const h = i + 1 < tops.length ? tops[i + 1].top - tops[i].top : tops[i].height;
        const id = visibleRows[i].id;
        const prev = heights.get(id);
        if (prev === undefined || Math.abs(prev - h) > 0.5) {
          if (prev === undefined) stats.count += 1;
          stats.sum += h - (prev ?? 0);
          heights.set(id, h);
          changed = true;
        }
      }
      if (changed) setLayoutVersion((v) => v + 1);
    }

    captureAnchor();
  }, [visibleRows, offsets]);

  // Recompute the window when the matched set or the measured layout changes.
  useLayoutEffect(() => {
    recalcWindow();
  }, [recalcWindow, offsets]);

  // Scroll/resize listeners, rAF-throttled. Listens on the real scroll parent
  // (falling back to window). Cached row heights are dropped when the width
  // changes, since text wrapping (and so row height) depends on it.
  const hasAccounts = accounts.length > 0;
  useEffect(() => {
    scrollParentRef.current = undefined;
    const scrollParent = resolveScrollParent();
    const scrollTarget = scrollParent || window;

    // We compensate for layout shifts ourselves; the browser's own scroll
    // anchoring would otherwise apply a second correction on top of ours.
    const previousAnchoring = scrollParent ? scrollParent.style.overflowAnchor : "";
    if (scrollParent) scrollParent.style.overflowAnchor = "none";

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        recalcWindow();
        ticking = false;
      });
    };
    const onResize = () => {
      const width = (scrollParent || document.documentElement).clientWidth;
      if (widthRef.current !== null && widthRef.current !== width) {
        heightsRef.current.clear();
        heightStatsRef.current = { sum: 0, count: 0 };
        setLayoutVersion((v) => v + 1);
      }
      widthRef.current = width;
      onScroll();
    };
    widthRef.current = (scrollParent || document.documentElement).clientWidth;

    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    let resizeObserver;
    if (scrollParent) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(scrollParent);
    }

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
      if (scrollParent) scrollParent.style.overflowAnchor = previousAnchoring;
    };
  }, [recalcWindow, resolveScrollParent, hasAccounts]);

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
            <tbody ref={bodyRef}>
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
                  <SpacerRow height={topSpacerHeight} />
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
                  <SpacerRow height={bottomSpacerHeight} />
                </>
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
