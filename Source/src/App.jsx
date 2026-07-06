import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Receipt, Wallet, Target, Plus, X, Pencil, Trash2,
  ArrowUpRight, ArrowDownRight, ArrowRightLeft, Search, PiggyBank,
  CreditCard, Landmark, Loader2, AlertCircle, Moon, Sun
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid
} from "recharts";

/* ---------------------------------- helpers ---------------------------------- */

const CAT_PALETTE = [
  "#C9A24B", "#3E8E7E", "#8B6F47", "#6B8E9F", "#B0463C",
  "#7A6A8A", "#A3763F", "#4F7C6B", "#9C7B4F", "#6E5B4A",
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (dateStr) => dateStr.slice(0, 7);
const currentMonthKey = () => monthKeyOf(todayStr());

const fmt = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
};

const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function seedCategories() {
  const expense = [
    ["Groceries", 500], ["Dining Out", 200], ["Transportation", 200],
    ["Utilities", 250], ["Housing", 1500], ["Entertainment", 100],
    ["Shopping", 150], ["Health", 100], ["Subscriptions", 50], ["Other", 100],
  ];
  const income = [["Salary", 0], ["Freelance", 0], ["Other Income", 0]];
  let i = 0;
  const cats = [];
  expense.forEach(([name, limit]) => {
    cats.push({ id: uid(), name, limit, type: "expense", color: CAT_PALETTE[i % CAT_PALETTE.length] });
    i++;
  });
  income.forEach(([name]) => {
    cats.push({ id: uid(), name, limit: 0, type: "income", color: CAT_PALETTE[i % CAT_PALETTE.length] });
    i++;
  });
  return cats;
}

function defaultState() {
  return { accounts: [], categories: seedCategories(), transactions: [] };
}

function computeBalance(account, transactions) {
  let balance = account.startingBalance || 0;
  transactions.forEach((t) => {
    if (t.type === "income" && t.accountId === account.id) balance += t.amount;
    else if (t.type === "expense" && t.accountId === account.id) balance -= t.amount;
    else if (t.type === "transfer") {
      if (t.accountId === account.id) balance -= t.amount;
      if (t.toAccountId === account.id) balance += t.amount;
    }
  });
  return balance;
}

const ACCOUNT_ICONS = { checking: Landmark, savings: PiggyBank, credit: CreditCard };
const ACCOUNT_LABELS = { checking: "Checking", savings: "Savings", credit: "Credit Card" };

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "budgets", label: "Budgets", icon: Target },
];

const VIEW_TITLES = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  accounts: "Accounts",
  budgets: "Budgets",
};

/* ---------------------------------- gauge ---------------------------------- */

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function Gauge({ spent, limit, label, size = 148 }) {
  const pct = limit > 0 ? spent / limit : 0;
  const displayPct = Math.min(pct, 1);
  const over = pct > 1;
  const color = over ? "var(--rust)" : pct > 0.85 ? "var(--amber)" : "var(--teal)";
  const cx = size / 2, cy = size / 2, r = size / 2 - 18;
  const track = describeArc(cx, cy, r, -135, 135);
  const value = describeArc(cx, cy, r, -135, -135 + 270 * displayPct);
  const ticks = [-135, -67.5, 0, 67.5, 135];

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path d={track} stroke="var(--border)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {displayPct > 0 && (
          <path d={value} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
        )}
        {ticks.map((a, i) => {
          const p1 = polarToCartesian(cx, cy, r + 9, a);
          const p2 = polarToCartesian(cx, cy, r + 15, a);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--text-faint)" strokeWidth="1.5" />;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" className="gauge-amount">{fmt(spent)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="gauge-sub">of {fmt(limit)}</text>
      </svg>
      <div className="gauge-label">{label}</div>
      {over && <div className="gauge-over">+{fmt(spent - limit)} over</div>}
    </div>
  );
}

/* ---------------------------------- small pieces ---------------------------------- */

function StatCard({ label, value, tone, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color: `var(--${tone})` }}><Icon size={18} /></div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value tone-${tone}`}>{value}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <Icon size={32} strokeWidth={1.4} />
      <div className="empty-title">{title}</div>
      <div className="empty-message">{message}</div>
      {actionLabel && <button className="btn btn-primary" onClick={onAction}><Plus size={16} /> {actionLabel}</button>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------- dashboard ---------------------------------- */

function Dashboard({ accounts, categories, transactions, balances, onAdd, onGoTx }) {
  const netWorth = accounts.reduce((s, a) => s + balances[a.id], 0);
  const totalAssets = accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + balances[a.id], 0);
  const totalDebt = accounts.filter((a) => a.type === "credit").reduce((s, a) => s + Math.max(0, -balances[a.id]), 0);

  const cmk = currentMonthKey();
  const monthTx = transactions.filter((t) => monthKeyOf(t.date) === cmk);
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const expenseCats = categories.filter((c) => c.type === "expense");
  const budgeted = expenseCats.filter((c) => c.limit > 0);
  const catSpend = budgeted.map((c) => ({
    ...c,
    spent: monthTx.filter((t) => t.type === "expense" && t.categoryId === c.id).reduce((s, t) => s + t.amount, 0),
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1))).slice(0, 4);

  const pieData = expenseCats.map((c) => ({
    name: c.name, color: c.color,
    value: monthTx.filter((t) => t.type === "expense" && t.categoryId === c.id).reduce((s, t) => s + t.amount, 0),
  })).filter((d) => d.value > 0);

  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleString("default", { month: "short" });
    const tx = transactions.filter((t) => monthKeyOf(t.date) === key);
    trendData.push({
      month: label,
      income: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    });
  }

  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || 0).slice(0, 6);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  if (accounts.length === 0) {
    return <EmptyState icon={Wallet} title="Set up your first account" message="Add a checking, savings, or credit card account to start tracking your money." actionLabel="Add account" onAction={onGoTx} />;
  }

  return (
    <div className="dash">
      <div className="stat-row">
        <StatCard label="Net worth" value={fmt(netWorth)} tone="brass" icon={Wallet} />
        <StatCard label="Total assets" value={fmt(totalAssets)} tone="teal" icon={ArrowUpRight} />
        <StatCard label="Total debt" value={fmt(totalDebt)} tone={totalDebt === 0 ? "teal" : "rust"} icon={CreditCard} />
        <StatCard label="This month, net" value={fmt(monthIncome - monthExpense)} tone={monthIncome - monthExpense >= 0 ? "teal" : "rust"} icon={monthIncome - monthExpense >= 0 ? ArrowUpRight : ArrowDownRight} />
      </div>

      {budgeted.length > 0 && (
        <div className="card">
          <div className="card-title">Budgets this month</div>
          <div className="gauge-row">
            {catSpend.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Spending by category</div>
          {pieData.length === 0 ? (
            <div className="chart-empty">No expenses logged this month yet.</div>
          ) : (
            <div className="pie-wrap">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="var(--surface)" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {pieData.sort((a, b) => b.value - a.value).map((d, i) => (
                  <div key={i} className="legend-row">
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span className="legend-name">{d.name}</span>
                    <span className="legend-val">{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Income vs. expenses, last 6 months</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
              <YAxis stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000) + "k" : v}`} width={44} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} cursor={{ fill: "var(--brass-soft)" }} />
              <Bar dataKey="income" fill="var(--teal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expense" fill="var(--rust)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent transactions</div>
        {recent.length === 0 ? (
          <div className="chart-empty">No transactions yet.</div>
        ) : (
          <table className="table">
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtDate(t.date)}</td>
                  <td>{t.description || catName(t.categoryId)}</td>
                  <td className="muted">{t.type === "transfer" ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : catName(t.categoryId)}</td>
                  <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>
                    {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- transactions view ---------------------------------- */

function TransactionsView({ accounts, categories, transactions, onEdit, onAdd, onDelete }) {
  const [filter, setFilter] = useState({ accountId: "all", type: "all", search: "" });
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  const filtered = transactions
    .filter((t) => filter.accountId === "all" || t.accountId === filter.accountId || t.toAccountId === filter.accountId)
    .filter((t) => filter.type === "all" || t.type === filter.type)
    .filter((t) => !filter.search || (t.description || "").toLowerCase().includes(filter.search.toLowerCase()) || catName(t.categoryId).toLowerCase().includes(filter.search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (accounts.length === 0) {
    return <EmptyState icon={Receipt} title="No accounts yet" message="Add an account first, then you can start logging transactions against it." />;
  }

  return (
    <div className="tx-view">
      <div className="filter-bar">
        <div className="search-input">
          <Search size={15} />
          <input placeholder="Search description or category" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
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
              <tr><th>Date</th><th>Description</th><th>Category / route</th><th>Account</th><th>Amount</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtDate(t.date)}</td>
                  <td>{t.description || "—"}</td>
                  <td>
                    {t.type === "transfer" ? (
                      <span className="pill"><ArrowRightLeft size={12} /> {accName(t.accountId)} → {accName(t.toAccountId)}</span>
                    ) : (
                      <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>
                    )}
                  </td>
                  <td className="muted">{accName(t.accountId)}</td>
                  <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>
                    {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}
                  </td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => onEdit(t)}><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => onDelete(t.id)}><Trash2 size={14} /></button>
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

/* ---------------------------------- accounts view ---------------------------------- */

function AccountsView({ accounts, balances, onAdd, onEdit, onDelete, error }) {
  if (accounts.length === 0) {
    return <EmptyState icon={Wallet} title="No accounts yet" message="Add a checking, savings, or credit card account to begin tracking balances." actionLabel="Add account" onAction={onAdd} />;
  }
  return (
    <div className="acc-view">
      {error && <div className="inline-error"><AlertCircle size={14} /> {error}</div>}
      <div className="acc-grid">
        {accounts.map((a) => {
          const Icon = ACCOUNT_ICONS[a.type];
          const bal = balances[a.id];
          const isDebt = a.type === "credit";
          return (
            <div key={a.id} className="acc-card">
              <div className="acc-top">
                <div className="acc-icon" style={{ color: `var(--${isDebt ? "rust" : a.type === "savings" ? "brass" : "teal"})` }}><Icon size={20} /></div>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => onEdit(a)}><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => onDelete(a.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="acc-name">{a.name}</div>
              <div className="acc-type">{ACCOUNT_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ""}</div>
              <div className={`acc-balance ${isDebt ? "tone-rust" : bal < 0 ? "tone-rust" : "tone-brass"}`}>
                {isDebt ? fmt(Math.max(0, -bal)) : fmt(bal)}
              </div>
              {isDebt && <div className="acc-sub muted">amount owed</div>}
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

/* ---------------------------------- budgets view ---------------------------------- */

function BudgetsView({ categories, transactions, onAdd, onEdit, onDelete }) {
  const cmk = currentMonthKey();
  const monthTx = transactions.filter((t) => t.type === "expense" && monthKeyOf(t.date) === cmk);
  const expenseCats = categories.filter((c) => c.type === "expense");
  const withSpend = expenseCats.map((c) => ({
    ...c, spent: monthTx.filter((t) => t.categoryId === c.id).reduce((s, t) => s + t.amount, 0),
  }));
  const budgeted = withSpend.filter((c) => c.limit > 0);

  return (
    <div className="budget-view">
      {budgeted.length > 0 && (
        <div className="card">
          <div className="card-title">This month</div>
          <div className="gauge-row">
            {budgeted.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
          </div>
        </div>
      )}
      <div className="card no-pad">
        <div className="card-title padded">
          Categories
          <button className="btn btn-ghost btn-sm" onClick={onAdd}><Plus size={14} /> Add category</button>
        </div>
        <table className="table full">
          <thead><tr><th>Name</th><th>Type</th><th>Spent this month</th><th>Monthly limit</th><th></th></tr></thead>
          <tbody>
            {withSpend.map((c) => (
              <tr key={c.id}>
                <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
                <td className="amount">{c.type === "expense" ? fmt(c.spent) : "—"}</td>
                <td className="amount">{c.type === "expense" ? (c.limit > 0 ? fmt(c.limit) : <span className="muted">Not set</span>) : "—"}</td>
                <td className="row-actions">
                  <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {categories.filter((c) => c.type === "income").map((c) => (
              <tr key={c.id}>
                <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
                <td className="muted">income</td>
                <td className="amount">—</td>
                <td className="amount">—</td>
                <td className="row-actions">
                  <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={14} /></button>
                  <button className="icon-btn" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------- modals ---------------------------------- */

function TransactionModal({ initial, accounts, categories, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [type, setType] = useState(initial.type || "expense");
  const [date, setDate] = useState(initial.date || todayStr());
  const [description, setDescription] = useState(initial.description || "");
  const [amount, setAmount] = useState(initial.amount ?? "");
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initial.toAccountId || "");
  const [categoryId, setCategoryId] = useState(initial.categoryId || "");

  const catOptions = categories.filter((c) => c.type === type);

  const canSave = amount && parseFloat(amount) > 0 && accountId && (type !== "transfer" || (toAccountId && toAccountId !== accountId));

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      type, date, description: description.trim(),
      amount: Math.abs(parseFloat(amount)),
      accountId,
      toAccountId: type === "transfer" ? toAccountId : null,
      categoryId: type === "transfer" ? null : (categoryId || null),
    });
  };

  return (
    <Modal title={isEdit ? "Edit transaction" : "Add transaction"} onClose={onClose}>
      <div className="modal-body">
        <div className="seg">
          {["expense", "income", "transfer"].map((t) => (
            <button key={t} className={`seg-btn ${type === t ? "active" : ""}`} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input className="input" placeholder="e.g. Trader Joe's" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{type === "transfer" ? "From account" : "Account"}</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {type === "transfer" ? (
            <div className="form-group">
              <label>To account</label>
              <select className="select" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select account</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Category</label>
              <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save transaction</button>
        </div>
      </div>
    </Modal>
  );
}

function AccountModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [institution, setInstitution] = useState(initial.institution || "");
  const [type, setType] = useState(initial.type || "checking");
  const isCredit = type === "credit";
  const existingDisplay = initial.id ? (isCredit ? Math.max(0, -(initial.startingBalance || 0)) : (initial.startingBalance || 0)) : "";
  const [balanceInput, setBalanceInput] = useState(existingDisplay);

  const canSave = name.trim().length > 0 && balanceInput !== "";

  const submit = () => {
    if (!canSave) return;
    const val = parseFloat(balanceInput) || 0;
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      institution: institution.trim(),
      type,
      startingBalance: isCredit ? -Math.abs(val) : val,
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
          <label>{isCredit ? "Current balance owed" : isEdit ? "Starting balance" : "Current balance"}</label>
          <input type="number" step="0.01" className="input mono" placeholder="0.00" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} />
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

function CategoryModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [type, setType] = useState(initial.type || "expense");
  const [limit, setLimit] = useState(initial.limit ?? "");

  const canSave = name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      type,
      limit: type === "expense" ? (parseFloat(limit) || 0) : 0,
      color: initial.color || CAT_PALETTE[Math.floor(Math.random() * CAT_PALETTE.length)],
    });
  };

  return (
    <Modal title={isEdit ? "Edit category" : "Add category"} onClose={onClose}>
      <div className="modal-body">
        <div className="form-group">
          <label>Category name</label>
          <input className="input" placeholder="e.g. Pet Care" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        {type === "expense" && (
          <div className="form-group">
            <label>Monthly budget limit</label>
            <input type="number" min="0" step="1" className="input mono" placeholder="0.00" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
        )}
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save category</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- app root ---------------------------------- */

const STORAGE_KEY = "vault-finance-data-v1";
const THEME_KEY = "amble-theme-pref-v1";

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState("dashboard");
  const [txModal, setTxModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [accError, setAccError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(THEME_KEY, false);
        if (res && res.value) setDarkMode(JSON.parse(res.value).dark);
      } catch (e) { /* default to light */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(THEME_KEY, JSON.stringify({ dark: darkMode }), false); }
      catch (e) { /* silent */ }
    })();
  }, [darkMode]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        setState(res && res.value ? JSON.parse(res.value) : defaultState());
      } catch (e) {
        setState(defaultState());
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !state) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(state), false); }
      catch (e) { /* silent - keeps working in-memory */ }
    })();
  }, [state, loaded]);

  if (!loaded || !state) {
    return (
      <div className={`app-loading${darkMode ? " dark" : ""}`}>
        <style>{CSS}</style>
        <Loader2 className="spin" size={22} /> Loading your data…
      </div>
    );
  }

  const balances = {};
  state.accounts.forEach((a) => { balances[a.id] = computeBalance(a, state.transactions); });

  const saveTransaction = (t) => {
    setState((s) => {
      const exists = s.transactions.some((x) => x.id === t.id);
      return { ...s, transactions: exists ? s.transactions.map((x) => x.id === t.id ? t : x) : [...s.transactions, t] };
    });
    setTxModal(null);
  };
  const deleteTransaction = (id) => {
    setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));
    setTxModal(null);
  };

  const saveAccount = (a) => {
    setState((s) => {
      const exists = s.accounts.some((x) => x.id === a.id);
      return { ...s, accounts: exists ? s.accounts.map((x) => x.id === a.id ? a : x) : [...s.accounts, a] };
    });
    setAccModal(null);
  };
  const deleteAccount = (id) => {
    const inUse = state.transactions.some((t) => t.accountId === id || t.toAccountId === id);
    if (inUse) { setAccError("This account has transactions on it. Delete those transactions first."); return; }
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
    setAccModal(null);
    setAccError("");
  };

  const saveCategory = (c) => {
    setState((s) => {
      const exists = s.categories.some((x) => x.id === c.id);
      return { ...s, categories: exists ? s.categories.map((x) => x.id === c.id ? c : x) : [...s.categories, c] };
    });
    setCatModal(null);
  };
  const deleteCategory = (id) => {
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      transactions: s.transactions.map((t) => t.categoryId === id ? { ...t, categoryId: null } : t),
    }));
    setCatModal(null);
  };

  const netWorth = state.accounts.reduce((s, a) => s + balances[a.id], 0);

  return (
    <div className={`app-root${darkMode ? " dark" : ""}`}>
      <style>{CSS}</style>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div className="brand-text">
              <div className="brand-name">AMBLE</div>
              <div className="brand-sub">personal finance</div>
            </div>
          </div>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
                <item.icon size={18} /> <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="nw-label">Net worth</div>
            <div className="nw-value">{fmt(netWorth)}</div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <h1 className="view-title">{VIEW_TITLES[view]}</h1>
            <div className="topbar-actions">
              <button className="icon-btn theme-toggle" onClick={() => setDarkMode((d) => !d)} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button className="btn btn-primary" onClick={() => setTxModal({})}><Plus size={16} /> Add transaction</button>
            </div>
          </header>
          <div className="content">
            {view === "dashboard" && (
              <Dashboard accounts={state.accounts} categories={state.categories} transactions={state.transactions} balances={balances} onGoTx={() => { setView("accounts"); setAccModal({}); }} />
            )}
            {view === "transactions" && (
              <TransactionsView accounts={state.accounts} categories={state.categories} transactions={state.transactions} onEdit={setTxModal} onAdd={() => setTxModal({})} onDelete={deleteTransaction} />
            )}
            {view === "accounts" && (
              <AccountsView accounts={state.accounts} balances={balances} onAdd={() => setAccModal({})} onEdit={setAccModal} onDelete={deleteAccount} error={accError} />
            )}
            {view === "budgets" && (
              <BudgetsView categories={state.categories} transactions={state.transactions} onAdd={() => setCatModal({})} onEdit={setCatModal} onDelete={deleteCategory} />
            )}
          </div>
        </main>
      </div>

      {txModal !== null && (
        <TransactionModal
          initial={txModal}
          accounts={state.accounts}
          categories={state.categories}
          onSave={saveTransaction}
          onClose={() => setTxModal(null)}
          onDelete={deleteTransaction}
        />
      )}
      {accModal !== null && (
        <AccountModal initial={accModal} onSave={saveAccount} onClose={() => { setAccModal(null); setAccError(""); }} onDelete={deleteAccount} />
      )}
      {catModal !== null && (
        <CategoryModal initial={catModal} onSave={saveCategory} onClose={() => setCatModal(null)} onDelete={deleteCategory} />
      )}
    </div>
  );
}

/* ---------------------------------- CSS ---------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
#root { min-height: 100vh; }

.app-root, .app-loading {
  --ink: #f4f9fd;
  --surface: #ffffff;
  --surface-2: #eaf4fc;
  --border: #c3dcef;
  --brass: #1f7dc4;
  --brass-soft: rgba(91,184,245,0.16);
  --on-brass: #ffffff;
  --teal: #1c86a8;
  --rust: #c1544a;
  --amber: #c98a2c;
  --text: #123249;
  --text-muted: #5b7a91;
  --text-faint: #7c9db4;
  font-family: 'Inter', sans-serif;
  color: var(--text);
  background: var(--ink);
  min-height: 100vh;
}
.app-root.dark, .app-loading.dark {
  --ink: #1a212c;
  --surface: #212936;
  --surface-2: #293344;
  --border: #384457;
  --brass: #6fb8ee;
  --brass-soft: rgba(111,184,238,0.14);
  --on-brass: #16222c;
  --teal: #57b8ac;
  --rust: #e08277;
  --amber: #e0b361;
  --text: #e5edf5;
  --text-muted: #a7b8c9;
  --text-faint: #77899c;
}
.app-root.dark .inline-error { background: rgba(224,130,119,0.12); color: #f3b7ae; }
@media (prefers-reduced-motion: no-preference) {
  .app-root, .app-root *, .app-loading { transition: background-color .2s ease, border-color .2s ease, color .2s ease; }
}
.app-loading { display:flex; align-items:center; gap:10px; justify-content:center; height:100vh; color:var(--text-muted); }
.spin { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: no-preference) { @keyframes spin { to { transform: rotate(360deg); } } }

.app-root *:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

.app-shell { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }

.sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; }
.brand { display:flex; align-items:center; gap:10px; padding: 6px 8px 20px; }
.brand-mark { width:34px; height:34px; border-radius:8px; background: var(--brass-soft); color: var(--brass); border:1px solid var(--brass); display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:600; font-size:18px; }
.brand-name { font-family:'Fraunces',serif; font-weight:600; font-size:16px; letter-spacing: 0.14em; }
.brand-sub { font-size: 11px; color: var(--text-faint); letter-spacing:0.04em; }

.nav { display:flex; flex-direction:column; gap:2px; flex:1; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; background:transparent; border:none; color: var(--text-muted); font-size:14px; font-weight:500; cursor:pointer; text-align:left; border-left: 2px solid transparent; transition: background .15s, color .15s; }
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: var(--brass-soft); color: var(--brass); border-left: 2px solid var(--brass); }

.sidebar-footer { border-top:1px solid var(--border); padding-top:14px; margin-top:10px; }
.nw-label { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.06em; }
.nw-value { font-family:'JetBrains Mono',monospace; font-size:19px; font-weight:600; color:var(--brass); margin-top:2px; }

.main { display:flex; flex-direction:column; min-width:0; }
.topbar { display:flex; align-items:center; justify-content:space-between; padding: 22px 32px; border-bottom:1px solid var(--border); }
.topbar-actions { display:flex; align-items:center; gap:10px; }
.theme-toggle { border:1px solid var(--border); background: var(--surface); width:36px; height:36px; align-items:center; justify-content:center; border-radius:8px; color: var(--text-muted); }
.theme-toggle:hover { color: var(--brass); border-color: var(--brass); }
.view-title { font-family:'Fraunces',serif; font-weight:600; font-size:24px; margin:0; }
.content { padding: 24px 32px 48px; overflow-y:auto; }

.btn { display:inline-flex; align-items:center; gap:6px; border-radius:8px; padding:9px 14px; font-size:13.5px; font-weight:500; cursor:pointer; border:1px solid transparent; font-family:'Inter',sans-serif; transition: filter .15s, background .15s; }
.btn-primary { background: var(--brass); color: var(--on-brass); }
.btn-primary:hover { filter: brightness(1.08); }
.btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
.btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-sm { padding:6px 10px; font-size:12.5px; }
.icon-btn { background:transparent; border:none; color:var(--text-faint); cursor:pointer; padding:6px; border-radius:6px; display:flex; }
.icon-btn:hover { background: var(--surface-2); color: var(--text); }

.stat-row { display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:20px; }
.stat-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
.stat-label { font-size:12px; color:var(--text-faint); margin-top:8px; }
.stat-value { font-family:'JetBrains Mono',monospace; font-size:21px; font-weight:600; margin-top:2px; }

.tone-brass { color: var(--brass); }
.tone-teal { color: var(--teal); }
.tone-rust { color: var(--rust); }
.tone-amber { color: var(--amber); }

.card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:18px; }
.card.no-pad { padding:0; overflow:hidden; }
.card-title { font-family:'Fraunces',serif; font-weight:600; font-size:15px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; }
.card-title.padded { padding: 18px 20px 0; }

.grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:18px; }

.gauge-row { display:flex; gap:22px; flex-wrap:wrap; }
.gauge { display:flex; flex-direction:column; align-items:center; width:150px; }
.gauge-amount { font-family:'JetBrains Mono',monospace; fill: var(--text); font-size:16px; font-weight:600; }
.gauge-sub { font-family:'JetBrains Mono',monospace; fill: var(--text-faint); font-size:10.5px; }
.gauge-label { font-size:12.5px; color:var(--text-muted); margin-top:2px; text-align:center; }
.gauge-over { font-size:11px; color:var(--rust); margin-top:2px; }

.chart-empty { color: var(--text-faint); font-size:13.5px; padding: 30px 0; text-align:center; }
.pie-wrap { display:flex; align-items:center; gap:12px; }
.pie-legend { flex:1; display:flex; flex-direction:column; gap:7px; }
.legend-row { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.legend-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.legend-name { flex:1; color:var(--text-muted); }
.legend-val { font-family:'JetBrains Mono',monospace; color:var(--text); }

.table { width:100%; border-collapse:collapse; font-size:13.5px; }
.table.full thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); font-weight:500; padding:14px 20px; border-bottom:1px solid var(--border); }
.table.full tbody td { padding:12px 20px; border-bottom:1px solid var(--border); }
.table.full tbody tr:last-child td { border-bottom:none; }
.table:not(.full) td { padding:8px 0; border-bottom:1px solid var(--border); }
.table:not(.full) tr:last-child td { border-bottom:none; }
.muted { color: var(--text-muted); }
.amount { font-family:'JetBrains Mono',monospace; font-weight:500; text-align:right; }
.row-actions { display:flex; gap:4px; justify-content:flex-end; }

.pill { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:3px 9px; border-radius:20px; border:1px solid var(--border); color:var(--text-muted); }

.filter-bar { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.search-input { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:8px 12px; flex:1; min-width:220px; color:var(--text-faint); }
.search-input input { background:transparent; border:none; color:var(--text); font-size:13.5px; width:100%; outline:none; }
.select, .input { background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); font-size:13.5px; font-family:'Inter',sans-serif; }
.input.mono, .select.mono { font-family:'JetBrains Mono',monospace; }

.acc-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px; }
.acc-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; display:flex; flex-direction:column; gap:2px; }
.acc-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.acc-icon { background: var(--surface-2); border-radius:8px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; }
.acc-name { font-weight:600; font-size:14.5px; }
.acc-type { font-size:11.5px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.acc-balance { font-family:'JetBrains Mono',monospace; font-size:19px; font-weight:600; }
.acc-sub { font-size:11px; margin-top:2px; }
.acc-add { align-items:center; justify-content:center; gap:8px; color:var(--text-faint); cursor:pointer; border-style:dashed; }
.acc-add:hover { color: var(--brass); border-color: var(--brass); }

.inline-error { display:flex; align-items:center; gap:8px; background: rgba(193,84,74,0.1); border:1px solid var(--rust); color:#8a3327; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px; }

.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding: 70px 20px; color: var(--text-faint); text-align:center; }
.empty-title { font-family:'Fraunces',serif; font-size:17px; font-weight:600; color: var(--text); margin-top:4px; }
.empty-message { font-size:13.5px; max-width:340px; margin-bottom:8px; }

.modal-overlay { position:fixed; inset:0; background: rgba(10,10,7,0.6); display:flex; align-items:center; justify-content:center; z-index:50; padding:20px; }
.modal { background: var(--surface); border:1px solid var(--border); border-radius:14px; width:100%; max-width:440px; max-height:90vh; overflow-y:auto; }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--border); }
.modal-header h2 { font-family:'Fraunces',serif; font-size:17px; font-weight:600; margin:0; }
.modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:14px; }
.modal-footer { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-top:1px solid var(--border); }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group label { font-size:12px; color:var(--text-muted); }
.form-group .input, .form-group .select { width:100%; }

.seg { display:flex; background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:3px; }
.seg-btn { flex:1; background:transparent; border:none; color:var(--text-muted); padding:7px; font-size:13px; font-weight:500; text-transform:capitalize; cursor:pointer; border-radius:6px; }
.seg-btn.active { background: var(--brass); color: var(--on-brass); }

@media (max-width: 860px) {
  .app-shell { grid-template-columns: 1fr; grid-template-rows:auto 1fr; }
  .sidebar { flex-direction:row; align-items:center; padding:10px 14px; }
  .brand { padding:0; flex:1; }
  .sidebar-footer { display:none; }
  .nav { flex-direction:row; }
  .nav-item span { display:none; }
  .stat-row, .grid-2 { grid-template-columns: 1fr 1fr; }
  .content { padding:18px; }
  .topbar { padding:16px 18px; }
}
`;
