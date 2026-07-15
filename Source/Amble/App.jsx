import React, { useState, useEffect, useMemo, useRef } from "react";
import { version as appVersion } from "../package.json";
import {
  LayoutDashboard, Receipt, Wallet, Target, Plus, X, Pencil, Trash2,
  ArrowUpRight, ArrowDownRight, ArrowRightLeft, Search, PiggyBank,
  CreditCard, Landmark, Loader2, AlertCircle, Moon, Sun, MoreHorizontal,
  Download, Upload, FileSpreadsheet, ClipboardList, CheckCircle2,
  Copy, Repeat, Sliders, Database, Info, Github, Globe, ChevronRight, Activity,
  Monitor, ChevronUp, ChevronDown
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, AreaChart, Area
} from "recharts";

/* ---------------------------------- helpers ---------------------------------- */

const CAT_PALETTE = [
  "#C9A24B", "#3E8E7E", "#8B6F47", "#6B8E9F", "#B0463C",
  "#7A6A8A", "#A3763F", "#4F7C6B", "#9C7B4F", "#6E5B4A",
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Number inputs change their value when the user scrolls over them while focused,
// which is an easy way to accidentally mangle an amount. Blurring on wheel stops
// the browser's default "scroll to change value" behavior for that field while
// still letting the scroll gesture itself pass through to scroll the page.
const blurOnWheel = (e) => e.target.blur();

// Used to keep global keyboard shortcuts from firing while the user is typing
// somewhere - e.g. pressing "1" while entering an amount, or "?" while typing
// "what?" into a description field, shouldn't trigger a shortcut.
const isTypingTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el.isContentEditable;
};

// Builds YYYY-MM-DD from a Date's *local* calendar fields. Deliberately avoids
// toISOString(), which converts to UTC first - in timezones behind UTC that
// flips to the next calendar day as soon as it's evening locally (and in
// timezones ahead of UTC can flip back a day), so any default/current-day
// logic built on it would be off by one for part of the day.
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayStr = () => toLocalDateStr(new Date());
const monthKeyOf = (dateStr) => dateStr.slice(0, 7);
const currentMonthKey = () => monthKeyOf(todayStr());

// A trailing 30-day window (today and the 29 days before it), used to scope spend
// for budgets/categories that don't have a fixed time frame - so their gauges track
// a consistent rolling month instead of resetting on the 1st of the calendar month.
function isWithinRolling30Days(dateStr) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffStr = toLocalDateStr(cutoff);
  return dateStr >= cutoffStr && dateStr <= todayStr();
}

// Sorts transactions newest first. Sorting on `date` alone leaves same-day
// transactions in whatever order they happened to already be in, so a transaction
// just added for today (or any date shared with existing entries) could land
// underneath older same-day entries instead of on top. Breaking ties by each
// transaction's position in the list (transactions are appended when created)
// puts the most recently created entry first within its date.
function sortTransactionsNewestFirst(list) {
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.i - a.i)
    .map(({ t }) => t);
}

const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
];
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

// Set once per render from the top-level App component (based on the user's saved
// preference) before any child component runs, so every fmt() call anywhere in the
// tree, no matter how deep, picks up the current currency without prop drilling.
let ACTIVE_CURRENCY = "USD";

const fmt = (n) => {
  const v = Number(n) || 0;
  const digits = ZERO_DECIMAL_CURRENCIES.has(ACTIVE_CURRENCY) ? 0 : 2;
  try {
    return v.toLocaleString("en-US", { style: "currency", currency: ACTIVE_CURRENCY, maximumFractionDigits: digits, minimumFractionDigits: digits });
  } catch (e) {
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
};

const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fmtDateTime = (iso) => {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return "Never";
  }
};

const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB"];
  let val = b / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
};

// The general (unowned by any budget) starter categories - just the income
// categories. The rest of the starter expense categories live inside the
// seeded Default Budget below.
function seedCategories() {
  const income = [["Salary", 0], ["Freelance", 0], ["Other Income", 0]];
  return income.map(([name], i) => ({
    id: uid(), name, limit: 0, type: "income", color: CAT_PALETTE[i % CAT_PALETTE.length],
  }));
}

const DEFAULT_BUDGET_CATEGORIES = [
  ["Groceries", 500], ["Dining Out", 200], ["Transportation", 200],
  ["Utilities", 250], ["Housing", 1500], ["Entertainment", 100],
  ["Shopping", 150], ["Health", 100], ["Subscriptions", 50],
];

function currentMonthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

// A starter budget so a fresh install isn't empty - scoped to the current month and
// set to repeat monthly, so it keeps rolling forward on its own via rolloverDuePlans.
function seedDefaultBudgetPlan() {
  const { startDate, endDate } = currentMonthRange();
  return {
    id: uid(),
    name: "Default Budget",
    startDate,
    endDate,
    income: DEFAULT_BUDGET_CATEGORIES.reduce((s, [, limit]) => s + limit, 0),
    dateCreated: todayStr(),
    active: true,
    repeat: { enabled: true, frequency: "monthly" },
    categories: DEFAULT_BUDGET_CATEGORIES.map(([name, limit]) => ({
      id: uid(), name, mode: "bulk", bulkAmount: limit, date: null, items: [],
    })),
  };
}

function defaultState() {
  const generalCategories = seedCategories();
  const synced = syncPlanCategories(seedDefaultBudgetPlan(), generalCategories);
  return {
    accounts: [], categories: synced.categories, transactions: [], plans: [synced.plan],
    currency: "USD", lastBackupAt: null,
  };
}

function planCategoryTotal(cat) {
  if (cat.mode === "items") return (cat.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return Number(cat.bulkAmount) || 0;
}

function planAllocated(plan) {
  return (plan.categories || []).reduce((s, c) => s + planCategoryTotal(c), 0);
}

// A transaction counts toward category spend if it's a normal expense, or if it's a
// transfer that's been explicitly tagged with a category (e.g. moving money into a
// dedicated savings category). Uncategorized transfers never count as spend.
function isSpendTx(t) {
  return t.type === "expense" || (t.type === "transfer" && !!t.categoryId);
}

// Spend for a category: if it belongs to a plan that has a time frame (a start
// and/or end date set), track every transaction ever assigned to it, all-time -
// gauges for a dated budget shouldn't reset just because the calendar month rolled
// over. If it belongs to a plan with no time frame, or isn't tied to a plan at all
// (a general category), scope it to a rolling 30-day window instead. Also rolls up
// spend from any sub-expense categories (itemized plan line items) so a parent
// category's total reflects money logged against its specific expenses too.
function categorySpend(category, transactions, plans, categories) {
  const ownerPlan = category.planId ? (plans || []).find((p) => p.id === category.planId) : null;
  const childIds = (categories || []).filter((c) => c.parentCategoryId === category.id).map((c) => c.id);
  const idSet = new Set([category.id, ...childIds]);
  let txs = transactions.filter((t) => isSpendTx(t) && idSet.has(t.categoryId));
  const hasTimeFrame = !!(ownerPlan && (ownerPlan.startDate || ownerPlan.endDate));
  if (!hasTimeFrame) txs = txs.filter((t) => isWithinRolling30Days(t.date));
  return txs.reduce((s, t) => s + t.amount, 0);
}

// Mirrors a plan's categories into the app-wide category list so they can be
// assigned to real transactions. Keeps existing links, creates new categories
// for new plan categories, and deletes ones removed from the plan (their ids are
// returned in removedCategoryIds so callers can also clear that categoryId off
// any transactions that referenced it).
// Itemized categories also mirror each line item as its own sub-category (linked via
// parentCategoryId) so a specific expense, like "Netflix" under "Subscriptions", can be
// selected directly on a transaction.
function syncPlanCategories(plan, categories) {
  let cats = categories.slice();
  const keepIds = new Set();
  const newPlanCats = (plan.categories || []).map((pc) => {
    const total = planCategoryTotal(pc);
    const existingIdx = pc.categoryId ? cats.findIndex((c) => c.id === pc.categoryId) : -1;
    let parentId, parentColor;
    if (existingIdx >= 0) {
      parentId = pc.categoryId;
      parentColor = cats[existingIdx].color;
      cats[existingIdx] = { ...cats[existingIdx], name: pc.name, limit: total, planId: plan.id, type: "expense", parentCategoryId: null, date: pc.date || null };
      keepIds.add(parentId);
    } else {
      parentId = uid();
      parentColor = CAT_PALETTE[Math.floor(Math.random() * CAT_PALETTE.length)];
      cats.push({
        id: parentId, name: pc.name, type: "expense", limit: total,
        color: parentColor, planId: plan.id, parentCategoryId: null, date: pc.date || null,
      });
      keepIds.add(parentId);
    }

    let newItems = pc.items;
    if (pc.mode === "items") {
      newItems = (pc.items || []).map((it) => {
        const itAmount = Number(it.amount) || 0;
        const existingItemIdx = it.categoryId ? cats.findIndex((c) => c.id === it.categoryId) : -1;
        if (existingItemIdx >= 0) {
          cats[existingItemIdx] = { ...cats[existingItemIdx], name: it.name, limit: itAmount, planId: plan.id, type: "expense", parentCategoryId: parentId, date: it.date || null };
          keepIds.add(it.categoryId);
          return it;
        }
        const newItemId = uid();
        cats.push({
          id: newItemId, name: it.name, type: "expense", limit: itAmount,
          color: parentColor, planId: plan.id, parentCategoryId: parentId, date: it.date || null,
        });
        keepIds.add(newItemId);
        return { ...it, categoryId: newItemId };
      });
    }

    return { ...pc, categoryId: parentId, items: newItems };
  });
  const removedCategoryIds = cats
    .filter((c) => c.planId === plan.id && !keepIds.has(c.id))
    .map((c) => c.id);
  cats = cats.filter((c) => !(c.planId === plan.id && !keepIds.has(c.id)));
  return { categories: cats, plan: { ...plan, categories: newPlanCats }, removedCategoryIds };
}

// Applies the removedCategoryIds from syncPlanCategories to a transactions list,
// clearing categoryId on any transaction that pointed at a category which no
// longer exists so it falls back to "uncategorized" instead of dangling.
function clearRemovedCategoryRefs(transactions, removedCategoryIds) {
  if (!removedCategoryIds || !removedCategoryIds.length) return transactions;
  const removedSet = new Set(removedCategoryIds);
  return transactions.map((t) => (removedSet.has(t.categoryId) ? { ...t, categoryId: null } : t));
}

const REPEAT_LABELS = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", match: "Match time frame" };
const REPEAT_DUE_PHRASES = { weekly: "a week after", biweekly: "2 weeks after", monthly: "a month after" };

// How long (in days) a plan's own time frame spans. Used both to show a preview
// in the Edit budget menu and, below, to size every repeated cycle so it always
// matches the length of the budget it's replacing - regardless of which repeat
// frequency was picked.
function planMatchDurationDays(plan) {
  if (!plan.startDate || !plan.endDate) return null;
  const start = new Date(plan.startDate + "T00:00:00");
  const end = new Date(plan.endDate + "T00:00:00");
  return Math.max(1, Math.round((end - start) / 86400000));
}

// Adds `monthsToAdd` calendar months to `dateStr`, targeting `anchorDay` as the
// day-of-month (falling back to dateStr's own day if no anchor is given) instead
// of plain Date#setMonth. setMonth overflows into the following month when the
// target month is too short (e.g. Jan 31 + 1 month becomes Mar 3, silently
// skipping February and permanently losing the "31" anchor on every cycle after
// that). Clamping to the target month's actual last day - while always re-aiming
// at the original anchor day rather than whatever day the previous, possibly
// already-clamped cycle landed on - is what keeps a budget that starts on the
// 29th/30th/31st repeating on that same day every month it exists, and only
// falling back to the last day of the month on the short months in between.
function addMonthsClamped(dateStr, monthsToAdd, anchorDay) {
  const d = new Date(dateStr + "T00:00:00");
  const day = anchorDay || d.getDate();
  const targetMonthIndex = d.getMonth() + monthsToAdd;
  const targetYear = d.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const result = new Date(targetYear, normalizedMonth, Math.min(day, lastDayOfTargetMonth));
  return toLocalDateStr(result);
}

// The date a repeating plan becomes due to generate its next cycle. "Match time
// frame" waits for the plan's own end date - its length is effectively the
// repeat interval. The fixed-interval frequencies (weekly/biweekly/monthly)
// instead count forward from the plan's start date, so a budget set to repeat
// weekly becomes due a week after it started, 2 weeks becomes due two weeks
// after it started, and so on - independent of how long the budget itself runs.
function planDueDate(plan) {
  if (!plan.startDate || !plan.endDate) return null;
  const freq = plan.repeat && plan.repeat.frequency;
  if (freq === "match") return plan.endDate;
  if (freq === "weekly") {
    const due = new Date(plan.startDate + "T00:00:00");
    due.setDate(due.getDate() + 7);
    return toLocalDateStr(due);
  }
  if (freq === "biweekly") {
    const due = new Date(plan.startDate + "T00:00:00");
    due.setDate(due.getDate() + 14);
    return toLocalDateStr(due);
  }
  if (freq === "monthly") {
    // Prefer the anchor day stored on the plan the first time repeating was set
    // up, so it survives every later cycle even if an in-between cycle had to
    // clamp down to a shorter month. Only falls back to the current startDate's
    // day for plans saved before anchorDay existed.
    const anchorDay = (plan.repeat && plan.repeat.anchorDay) || new Date(plan.startDate + "T00:00:00").getDate();
    return addMonthsClamped(plan.startDate, 1, anchorDay);
  }
  return null;
}

// Computes the next cycle's start/end dates. The cycle it produces always
// keeps the exact same length as the budget being repeated, but *when* it
// starts depends on the repeat frequency (see planDueDate): "Match time
// frame" chains continuously off the current end date (no gap, no overlap),
// while the fixed-interval frequencies (weekly/biweekly/monthly) anchor the
// new cycle's start to the due date itself - a fixed interval after the
// current cycle's *start* date, not after wherever its end date happens to
// fall. That's what makes a 2-week budget repeating monthly actually start a
// month after its start date, rather than the day its old cycle ends.
function nextPlanDates(plan) {
  const durationDays = planMatchDurationDays(plan);
  if (!durationDays) return null;
  const freq = plan.repeat && plan.repeat.frequency;
  let start;
  if (freq === "match") {
    start = new Date(plan.endDate + "T00:00:00");
    start.setDate(start.getDate() + 1);
  } else {
    const due = planDueDate(plan);
    if (!due) return null;
    start = new Date(due + "T00:00:00");
  }
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

// Rolls forward any active, repeat-enabled plans that have become due (see planDueDate),
// duplicating each into a fresh plan/cycle (with its own categories) so historical data
// stays intact.
function rolloverDuePlans(state) {
  const today = todayStr();
  let categories = state.categories.slice();
  let plans = state.plans.slice();
  let transactions = state.transactions.slice();
  let mutated = false;

  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    if (!(p.active && p.repeat && p.repeat.enabled && p.startDate && p.endDate)) continue;

    let cur = p;
    let lastNew = null;
    let iterations = 0;
    let due = planDueDate(cur);
    while (due && due < today && iterations < 104) {
      const dates = nextPlanDates(cur);
      if (!dates) break;
      iterations++;
      lastNew = {
        id: uid(),
        name: p.name,
        startDate: dates.startDate,
        endDate: dates.endDate,
        income: p.income,
        incomeItems: (p.incomeItems || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount })),
        dateCreated: today,
        active: true,
        repeat: { ...p.repeat },
        categories: (p.categories || []).map((c) => ({
          id: uid(), name: c.name, mode: c.mode, bulkAmount: c.bulkAmount, date: c.date || null,
          items: (c.items || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount, date: it.date || null })),
        })),
      };
      cur = lastNew;
      due = planDueDate(cur);
    }
    if (lastNew) {
      mutated = true;
      plans[i] = { ...p, active: false };
      const synced = syncPlanCategories(lastNew, categories);
      categories = synced.categories;
      plans.push(synced.plan);
      transactions = clearRemovedCategoryRefs(transactions, synced.removedCategoryIds);
    }
  }

  return mutated ? { ...state, plans, categories, transactions } : state;
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

const APP_INFO = {
  name: "Amble",
  tagline: "Personal Finances Made Simple",
  version: appVersion,
  maintainerName: "Cole Bishop",
  maintainerHandle: "@cogito11",
  githubUrl: "https://github.com/Cogito11/Amble-Finance",
  websiteUrl: "https://cogito11.github.io/Amble-Finance/",
};

// Mac uses the ⌘ glyph in shortcut hints everywhere else on the platform, so
// matching that (instead of always showing "Ctrl") makes the hints feel native
// on each OS. Falls back to "Ctrl" anywhere navigator.platform isn't Mac-like
// (Windows, Linux, or when running somewhere navigator is unavailable).
const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

// Single source of truth for every keyboard shortcut Amble supports - driving both
// the held-"?" preview and the reference list in About, so the two can never drift
// out of sync with each other.
const SHORTCUTS = [
  {
    group: "General",
    items: [
      { keys: [MOD_KEY, "N"], label: "New transaction" },
      { keys: [MOD_KEY, "F"], label: "Search transactions" },
      { keys: [MOD_KEY, "E"], label: "Export transactions (CSV)" },
      { keys: [MOD_KEY, "D"], label: "Toggle dark / light mode" },
      { keys: ["?"], label: "Hold to preview shortcuts" },
      { keys: ["Esc"], label: "Close a dialog" },
    ],
  },
  {
    group: "Navigation",
    items: [
      { keys: ["1"], label: "Dashboard" },
      { keys: ["2"], label: "Transactions" },
      { keys: ["3"], label: "Accounts" },
      { keys: ["4"], label: "Status" },
      { keys: ["5"], label: "Budgets" },
      { keys: ["6"], label: "More" },
    ],
  },
];

const ACCOUNT_ICONS = { checking: Landmark, savings: PiggyBank, credit: CreditCard };
const ACCOUNT_LABELS = { checking: "Checking", savings: "Savings", credit: "Credit Card" };

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "budgets", label: "Status", icon: Activity },
  { id: "plans", label: "Budgets", icon: ClipboardList },
];

const VIEW_TITLES = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  accounts: "Accounts",
  budgets: "Status",
  plans: "Budgets",
  more: "More",
};

// Catalog of dashboard widgets the user can toggle on/off. `id` is the key used
// in the persisted preference object; order here also controls the order the
// checkboxes appear in the customize modal (not the render order, which stays
// fixed so the layout - stat row, then gauges, then charts, then table — always
// reads top to bottom the same way).
const DASHBOARD_WIDGETS = [
  { id: "stats", label: "Overview stats", description: "Net worth, total assets, total debt, and this month's net" },
  { id: "accounts", label: "Accounts", description: "A quick list of your accounts and their current balances" },
  { id: "budgetProgress", label: "Active budget progress", description: "Spent vs. budgeted progress bar for your active budget" },
  { id: "budgetGauges", label: "Budget gauges", description: "Progress gauges for your top budget categories" },
  { id: "netWorthTrend", label: "Net worth trend", description: "Chart of your net worth over the last 6 months" },
  { id: "categoryPie", label: "Spending by category", description: "Pie chart breakdown of expenses, per category, over each budget's time frame (or a rolling 30 days if it has none)" },
  { id: "trend", label: "Income vs. expenses trend", description: "Bar chart comparing income and spending over the last 6 months" },
  { id: "recent", label: "Recent transactions", description: "A table of your most recent transactions" },
];

function defaultWidgetPrefs() {
  return DASHBOARD_WIDGETS.reduce((acc, w) => { acc[w.id] = true; return acc; }, {});
}

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

function Gauge({ spent, limit, label, size = 148, footnote }) {
  const pct = limit > 0 ? spent / limit : 0;
  const displayPct = Math.min(pct, 1);
  const over = pct > 1;
  const color = over ? "var(--rust)" : pct > 0.85 ? "var(--amber)" : "var(--teal)";
  const cx = size / 2, cy = size / 2, r = size / 2 - 18;
  const track = describeArc(cx, cy, r, -135, 135);
  const value = describeArc(cx, cy, r, -135, -135 + 270 * displayPct);
  const ticks = [-135, -67.5, 0, 67.5, 135];
  const remaining = limit - spent;

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
      {footnote !== undefined ? (
        <div className="gauge-remaining">{footnote}</div>
      ) : over ? (
        <div className="gauge-over">+{fmt(spent - limit)} over</div>
      ) : (
        <div className="gauge-remaining">{fmt(remaining)} remaining</div>
      )}
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

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " modal-lg" : ""}`}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Delete", tone = "danger", hideCancel = false, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onCancel}><X size={18} /></button>
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

// Renders one shortcut's key combo as individual <kbd> badges, e.g. [⌘] + [N].
function ShortcutKeys({ keys }) {
  return (
    <span className="shortcut-keys">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="kbd-plus">+</span>}
          <kbd className="kbd">{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

// Shared between the held-"?" preview overlay and the About tab's reference
// list, so both always show the exact same set of shortcuts.
function ShortcutsList() {
  return (
    <div className="shortcuts-list">
      {SHORTCUTS.map((g) => (
        <div className="shortcuts-group" key={g.group}>
          <div className="shortcuts-group-title">{g.group}</div>
          {g.items.map((item) => (
            <div className="shortcut-row" key={item.label}>
              <span className="shortcut-label">{item.label}</span>
              <ShortcutKeys keys={item.keys} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// The quick-peek panel shown while "?" is held down (see the keydown/keyup
// handling in App). The same list is also always visible, unhidden, on the
// About tab for reference.
function ShortcutsModal({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="modal-body">
        <ShortcutsList />
      </div>
    </Modal>
  );
}

const MORE_TABS = [
  { id: "settings", label: "Settings", icon: Sliders },
  { id: "data", label: "Data", icon: Database },
  { id: "about", label: "About", icon: Info },
];

// The three appearance choices shown as a segmented control, matching the
// look of the Settings/Data/About tabs above. "system" tracks the OS/browser
// prefers-color-scheme setting instead of pinning to one theme.
const THEME_MODE_OPTIONS = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

function MoreView({
  onExportJSON, onImportJSON, onExportCSV, transactionCount, themeMode, onChangeThemeMode,
  currency, onChangeCurrency, accountCount, budgetCount, categoryCount, dbSizeBytes, lastBackupAt,
  onDeleteAllTransactions, onDeleteAllBudgets, onDeleteAllCategories, onResetSampleData, onFactoryReset,
  dashboardWidgets, onToggleWidget,
}) {
  const [tab, setTab] = useState("settings");
  const fileInputRef = useRef(null);

  return (
    <div className="more-view">
      <div className="seg more-tabs">
        {MORE_TABS.map((t) => (
          <button key={t.id} type="button" className={`seg-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <div className="card">
          <div className="card-title">Appearance</div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Theme</div>
              <div className="settings-desc">Choose a theme, or match your system setting automatically.</div>
            </div>
            <div className="seg theme-mode-seg" role="group" aria-label="Appearance">
              {THEME_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`seg-btn ${themeMode === opt.id ? "active" : ""}`}
                  onClick={() => onChangeThemeMode(opt.id)}
                  title={opt.label}
                >
                  <opt.icon size={14} /> {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
            <div>
              <div className="settings-row-label">Currency</div>
              <div className="settings-desc">Amounts throughout Amble will be displayed in this currency.</div>
            </div>
            <select className="select" value={currency} onChange={(e) => onChangeCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} ({c.name})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <div className="card-title">Dashboard</div>
          <p className="settings-desc">Choose which widgets appear on your dashboard. Hidden widgets keep their data — nothing is deleted.</p>
          <div className="widget-toggle-list">
            {DASHBOARD_WIDGETS.map((item) => (
              <label key={item.id} className="widget-toggle-row">
                <input type="checkbox" checked={!!dashboardWidgets?.[item.id]} onChange={() => onToggleWidget(item.id)} />
                <div className="widget-toggle-text">
                  <div className="widget-toggle-label">{item.label}</div>
                  <div className="widget-toggle-desc">{item.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === "data" && (
        <>
          <div className="card">
            <div className="card-title">Storage</div>
            <div className="about-details">
              <div className="about-row"><span className="muted">Database size</span><span>{formatBytes(dbSizeBytes)}</span></div>
              <div className="about-row"><span className="muted">Transactions</span><span>{transactionCount.toLocaleString()}</span></div>
              <div className="about-row"><span className="muted">Accounts</span><span>{accountCount.toLocaleString()}</span></div>
              <div className="about-row"><span className="muted">Budgets</span><span>{budgetCount.toLocaleString()}</span></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Backup &amp; restore</div>
            <p className="settings-desc">
              Export a full backup of your accounts, categories, transactions, and plans as a
              JSON file. Use it to move your data to another computer or restore it later — your
              data never leaves this device on its own.
            </p>
            <div className="about-details">
              <div className="about-row"><span className="muted">Last backup</span><span>{fmtDateTime(lastBackupAt)}</span></div>
            </div>
            <div className="settings-actions">
              <button className="btn btn-ghost" onClick={onExportJSON}><Download size={14} /> Export backup (.json)</button>
              <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Import backup (.json)</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJSON(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="card">
            <div className="card-title">Spreadsheet export</div>
            <p className="settings-desc">
              Export your {transactionCount} transaction{transactionCount === 1 ? "" : "s"} as a
              CSV file to open in Excel, Numbers, or Google Sheets. This is one-way — it's meant
              for analysis, not as a backup you'd import back in.
            </p>
            <div className="settings-actions">
              <button className="btn btn-ghost" onClick={onExportCSV} disabled={transactionCount === 0}>
                <FileSpreadsheet size={14} /> Export transactions (.csv)
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Data cleanup</div>
            <p className="settings-desc">
              Bulk actions for clearing out data you no longer need. Each of these is permanent
              and cannot be undone. Amble will ask you to confirm first.
            </p>
            <div className="settings-actions">
              <button className="btn btn-ghost tone-rust" onClick={onDeleteAllTransactions} disabled={transactionCount === 0}>
                <Trash2 size={14} /> Delete all transactions
              </button>
              <button className="btn btn-ghost tone-rust" onClick={onDeleteAllBudgets} disabled={budgetCount === 0}>
                <Trash2 size={14} /> Delete all budgets
              </button>
              <button className="btn btn-ghost tone-rust" onClick={onDeleteAllCategories} disabled={categoryCount === 0}>
                <Trash2 size={14} /> Delete all categories
              </button>
              <button className="btn btn-ghost" onClick={onResetSampleData}>
                <Repeat size={14} /> Reset sample/default data
              </button>
            </div>
            <div className="settings-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4, borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
              <div>
                <div className="settings-row-label">Factory reset application</div>
                <div className="settings-desc" style={{ margin: 0 }}>Wipes all data and preferences, returning Amble to a fresh install.</div>
              </div>
              <button className="btn btn-danger" onClick={onFactoryReset}><AlertCircle size={14} /> Factory reset</button>
            </div>
          </div>
        </>
      )}

      {tab === "about" && (
        <div className="card about-card">
          <div className="about-brand">
            <div className="brand-mark about-brand-mark">$</div>
            <div>
              <div className="about-app-name">{APP_INFO.name}</div>
              <div className="muted">{APP_INFO.tagline}</div>
            </div>
          </div>
          <div className="about-details">
            <div className="about-row"><span className="muted">Version</span><span>{APP_INFO.version}</span></div>
            <div className="about-row"><span className="muted">Developed By</span><span>{APP_INFO.maintainerName} ({APP_INFO.maintainerHandle})</span></div>
          </div>
          <div className="settings-actions about-links">
            <a className="btn btn-ghost" href={APP_INFO.githubUrl} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a>
            {APP_INFO.websiteUrl && (
              <a className="btn btn-ghost" href={APP_INFO.websiteUrl} target="_blank" rel="noreferrer"><Globe size={14} /> Website</a>
            )}
          </div>
        </div>
      )}

      {tab === "about" && (
        <div className="card">
          <div className="card-title">Keyboard Shortcuts</div>
          <div className="settings-desc" style={{ marginTop: -6 }}>
            Hold <kbd className="kbd">?</kbd> anywhere in the app for a quick preview of these.
          </div>
          <ShortcutsList />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- dashboard ---------------------------------- */

function Dashboard({ accounts, categories, transactions, balances, plans, onAdd, onGoTx, onNavigate, widgets, onCustomize }) {
  const w = widgets || defaultWidgetPrefs();
  const netWorth = accounts.reduce((s, a) => s + balances[a.id], 0);
  const totalAssets = accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + balances[a.id], 0);
  const totalDebt = accounts.filter((a) => a.type === "credit").reduce((s, a) => s + Math.max(0, -balances[a.id]), 0);

  const cmk = currentMonthKey();
  const monthTx = transactions.filter((t) => monthKeyOf(t.date) === cmk);
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const activePlan = (plans || []).find((p) => p.active) || null;
  const activePlanId = activePlan?.id;
  // Only top-level categories here; itemized sub-expenses (e.g. "Netflix" under
  // "Subscriptions") roll their spend up into the parent instead of appearing separately.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  // Same rule as the Status tab: general categories + the active plan's categories only.
  const budgeted = expenseCats.filter((c) => c.limit > 0 && (!c.planId || c.planId === activePlanId));
  // Gauges track all-time spend for dated budgets, and a rolling 30 days for
  // everything else (undated budgets and general categories) — see categorySpend.
  const catSpend = budgeted.map((c) => ({
    ...c,
    spent: categorySpend(c, transactions, plans, categories),
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1))).slice(0, 4);

  // "Uncategorized" isn't tied to any budget, so — like any category with no time
  // frame — its gauge is scoped to a rolling 30 days rather than the calendar month.
  const rolling30Tx = transactions.filter((t) => t.type === "expense" && isWithinRolling30Days(t.date));
  const uncategorizedSpentRolling = rolling30Tx.filter((t) => !t.categoryId).reduce((s, t) => s + t.amount, 0);
  const rolling30Expense = rolling30Tx.reduce((s, t) => s + t.amount, 0);

  // Same rule as the budget gauges above: general categories + the active plan's
  // categories only, so a deactivated budget's spend doesn't linger in the pie. Each
  // slice's value follows categorySpend's time-frame rule too — all-time for a category
  // whose plan has a start/end date, rolling 30 days for everything else — so the pie
  // and the gauges always agree on what a given category's "spend" means.
  const pieData = expenseCats
    .filter((c) => !c.planId || c.planId === activePlanId)
    .map((c) => ({
      name: c.name, color: c.color,
      value: categorySpend(c, transactions, plans, categories),
    })).filter((d) => d.value > 0);

  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = toLocalDateStr(d).slice(0, 7);
    const label = d.toLocaleString("default", { month: "short" });
    const tx = transactions.filter((t) => monthKeyOf(t.date) === key);
    trendData.push({
      month: label,
      income: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    });
  }

  // Net worth over time, at exact granularity: one point for every date in the
  // last 6 months that actually has a transaction, instead of a single sampled
  // value per month. Each point is net worth as of the end of that date,
  // reconstructed by replaying every transaction dated on or before it — same
  // "replay through computeBalance" approach as before, just at the resolution
  // of individual transaction dates rather than month boundaries.
  const dateToTs = (isoDate) => new Date(`${isoDate}T00:00:00`).getTime();
  const today = todayStr();
  const nwTodayTs = dateToTs(today);

  // The 1st of each of the last 6 months. Used both as explicit x-axis tick
  // marks and as guaranteed "anchor" data points below, so every month has
  // something to hover even in months with zero transactions.
  const nwMonthStarts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    nwMonthStarts.push(toLocalDateStr(d));
  }
  const nwWindowStart = nwMonthStarts[0];
  const nwWindowStartTs = dateToTs(nwWindowStart);

  // Every date the chart needs a point for: the start of each month (so a
  // quiet month still shows its carried-forward value on hover, instead of
  // just a long gap the line has to interpolate across) plus every date that
  // actually has a transaction. Multiple transactions on the same day still
  // collapse into a single point.
  const txDatesInWindow = transactions.filter((t) => t.date >= nwWindowStart && t.date <= today).map((t) => t.date);
  const allDatesInWindow = Array.from(new Set([...nwMonthStarts, ...txDatesInWindow])).sort();

  const netWorthTrendData = allDatesInWindow.map((date) => {
    const txUpTo = transactions.filter((t) => t.date <= date);
    return { date, t: dateToTs(date), netWorth: accounts.reduce((s, a) => s + computeBalance(a, txUpTo), 0) };
  });
  // Always end on today's actual net worth, even on a day with no transactions,
  // so the line reflects the current balance rather than stopping early.
  if (netWorthTrendData[netWorthTrendData.length - 1].date !== today) {
    netWorthTrendData.push({ date: today, t: nwTodayTs, netWorth });
  }

  // Explicit x-axis ticks: the 1st of each of the last 6 months. Left to its
  // own auto-generation on a numeric time domain, Recharts (combined with
  // minTickGap) tended to collapse down to just the first/last tick, so the
  // month markers are pinned explicitly instead.
  const nwMonthTicks = nwMonthStarts.map(dateToTs);


  // By default a value axis starts at 0, which flattens a high net worth's small
  // month-to-month swings into an almost-straight line. Instead, raise the floor to
  // just under the lowest value in the series (with a little padding above/below so
  // the line never touches the edges), leaving the top essentially as-is.
  const nwValues = netWorthTrendData.map((d) => d.netWorth);
  const nwMin = Math.min(...nwValues);
  const nwMax = Math.max(...nwValues);
  const nwRange = nwMax - nwMin;
  const nwPadding = nwRange > 0 ? nwRange * 0.15 : Math.max(Math.abs(nwMax) * 0.05, 50);
  const nwFloor = nwMin - nwPadding;
  // Net worth is usually non-negative, so a padded floor that dips below 0 just
  // reads as a confusing negative axis label. Clamp it at 0 — unless net worth
  // itself actually went negative, in which case flooring at 0 would clip that
  // real data off the chart, so let the floor track it in that case.
  const nwDomain = [nwMin < 0 ? nwFloor : Math.max(0, nwFloor), nwMax + nwPadding];
  // Since nwDomain's bounds are arbitrary (not "round" numbers), letting the axis
  // auto-generate ticks can produce an uneven extra gridline wedged in near the
  // bottom. Pinning exactly 3 ticks — floor, midpoint, ceiling — keeps the grid to
  // a clean top/middle/bottom with nothing stray in between.
  const nwTicks = [nwDomain[0], (nwDomain[0] + nwDomain[1]) / 2, nwDomain[1]];

  const planBudgeted = activePlan ? planAllocated(activePlan) : 0;
  const planSpent = activePlan ? planTotalSpent(activePlan, transactions) : 0;
  const planRemaining = planBudgeted - planSpent;
  const planPct = planBudgeted > 0 ? planSpent / planBudgeted : 0;
  const planBarColor = planPct > 1 ? "var(--rust)" : planPct > 0.85 ? "var(--amber)" : "var(--teal)";

  const recent = sortTransactionsNewestFirst(transactions).slice(0, 6);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  if (accounts.length === 0) {
    return <EmptyState icon={Wallet} title="Set up your first account" message="Add a checking, savings, or credit card account to start tracking your money." actionLabel="Add account" onAction={onGoTx} />;
  }

  const anyWidgetOn = DASHBOARD_WIDGETS.some((d) => w[d.id]);
  if (!anyWidgetOn) {
    return (
      <EmptyState
        icon={Sliders}
        title="Your dashboard is empty"
        message="Every widget is currently hidden. Turn some back on to see your finances at a glance."
        actionLabel="Customize dashboard"
        onAction={onCustomize}
      />
    );
  }

  const showPie = w.categoryPie;
  const showTrend = w.trend;

  return (
    <div className="dash">
      {w.stats && (
        <div className="stat-row">
          <StatCard label="Net worth" value={fmt(netWorth)} tone="brass" icon={Wallet} />
          <StatCard label="Total assets" value={fmt(totalAssets)} tone="teal" icon={ArrowUpRight} />
          <StatCard label="Total debt" value={fmt(totalDebt)} tone={totalDebt === 0 ? "teal" : "rust"} icon={CreditCard} />
          <StatCard label="This month, net" value={fmt(monthIncome - monthExpense)} tone={monthIncome - monthExpense >= 0 ? "teal" : "rust"} icon={monthIncome - monthExpense >= 0 ? ArrowUpRight : ArrowDownRight} />
        </div>
      )}

      {(w.accounts || w.budgetProgress) && (
        <div className={`grid-2${w.accounts && w.budgetProgress ? "" : " grid-2-single"}`}>
          {w.accounts && (
            <div className="card">
              <div className="card-title">
                Accounts
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.("accounts")}>View all <ChevronRight size={14} /></button>
              </div>
              <div className="dash-acc-list">
                {accounts.map((a) => {
                  const Icon = ACCOUNT_ICONS[a.type];
                  const bal = balances[a.id];
                  const isDebt = a.type === "credit";
                  return (
                    <div key={a.id} className="dash-acc-row">
                      <div className="dash-acc-icon" style={{ color: `var(--${isDebt ? "rust" : a.type === "savings" ? "brass" : "teal"})` }}><Icon size={16} /></div>
                      <div className="dash-acc-info">
                        <div className="dash-acc-name">{a.name}</div>
                        <div className="dash-acc-type muted">{ACCOUNT_LABELS[a.type]}</div>
                      </div>
                      <div className={`dash-acc-balance ${isDebt || bal < 0 ? "tone-rust" : "tone-brass"}`}>
                        {isDebt ? fmt(Math.max(0, -bal)) : fmt(bal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {w.budgetProgress && (
            <div className="card">
              <div className="card-title">
                Active budget
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.("plans")}>View budgets <ChevronRight size={14} /></button>
              </div>
              {activePlan ? (
                <div className="dash-budget">
                  <div className="dash-budget-name">{activePlan.name}</div>
                  <div className="dash-budget-bar-track">
                    <div className="dash-budget-bar-fill" style={{ width: `${Math.min(planPct, 1) * 100}%`, background: planBarColor }} />
                  </div>
                  <div className="plan-summary-bar">
                    <div>
                      <span className="muted">Budgeted</span>
                      <strong>{fmt(planBudgeted)}</strong>
                    </div>
                    <div>
                      <span className="muted">Spent</span>
                      <strong>{fmt(planSpent)}</strong>
                    </div>
                    <div>
                      <span className="muted">Remaining</span>
                      <strong className={planRemaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(planRemaining)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chart-empty">No active budget. Set one as active in Budgets to track it here.</div>
              )}
            </div>
          )}
        </div>
      )}

      {w.budgetGauges && (budgeted.length > 0 || uncategorizedSpentRolling > 0) && (
        <div className="card">
          <div className="card-title">Budget progress</div>
          <div className="gauge-row">
            {catSpend.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
            {uncategorizedSpentRolling > 0 && (
              <Gauge
                spent={uncategorizedSpentRolling}
                limit={rolling30Expense}
                label="Uncategorized"
                footnote={`${Math.round((uncategorizedSpentRolling / rolling30Expense) * 100)}% of spending`}
              />
            )}
          </div>
        </div>
      )}

      {w.netWorthTrend && (
        <div className="card">
          <div className="card-title">Net worth, last 6 months</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={netWorthTrendData}>
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brass)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brass)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[nwWindowStartTs, nwTodayTs]}
                ticks={nwMonthTicks}
                interval={0}
                stroke="var(--text-faint)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(ts) => new Date(ts).toLocaleString("default", { month: "short" })}
              />
              <YAxis
                domain={nwDomain}
                ticks={nwTicks}
                stroke="var(--text-faint)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v < 0 ? "-" : ""}$${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1).replace(/\.0$/, "") + "k" : Math.round(Math.abs(v))}`}
                width={48}
              />
              <Tooltip
                formatter={(v) => fmt(v)}
                labelFormatter={(ts) => new Date(ts).toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" })}
                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
                itemStyle={{ color: "var(--text)" }}
                labelStyle={{ color: "var(--text)" }}
              />
              <Area type="stepAfter" dataKey="netWorth" stroke="var(--brass)" strokeWidth={2.5} fill="url(#netWorthFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {(showPie || showTrend) && (
        <div className={`grid-2${showPie && showTrend ? "" : " grid-2-single"}`}>
          {showPie && (
            <div className="card">
              <div className="card-title">Spending by category</div>
              {pieData.length === 0 ? (
                <div className="chart-empty">No expenses logged yet.</div>
              ) : (
                <div className="pie-wrap">
                  <div className="pie-chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={2}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="var(--surface)" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pie-legend">
                    {[...pieData].sort((a, b) => b.value - a.value).map((d, i) => (
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
          )}

          {showTrend && (
            <div className="card">
              <div className="card-title">Income vs. expenses, last 6 months</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000) + "k" : v}`} width={44} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} cursor={{ fill: "var(--brass-soft)" }} />
                  <Bar dataKey="income" fill="var(--teal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="expense" fill="var(--rust)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {w.recent && (
        <div className="card">
          <div className="card-title">Recent transactions</div>
          {recent.length === 0 ? (
            <div className="chart-empty">No transactions yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th className="col-right">Amount</th></tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtDate(t.date)}</td>
                    <td>{t.description || catName(t.categoryId)}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- dashboard customize modal ---------------------------------- */

function WidgetSettingsModal({ widgets, onToggle, onClose }) {
  return (
    <Modal title="Customize dashboard" onClose={onClose}>
      <div className="modal-body">
        <p className="settings-desc">Choose which widgets appear on your dashboard. Hidden widgets keep their data so nothing is deleted.</p>
        <div className="widget-toggle-list">
          {DASHBOARD_WIDGETS.map((item) => (
            <label key={item.id} className="widget-toggle-row">
              <input type="checkbox" checked={!!widgets[item.id]} onChange={() => onToggle(item.id)} />
              <div className="widget-toggle-text">
                <div className="widget-toggle-label">{item.label}</div>
                <div className="widget-toggle-desc">{item.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------- transactions view ---------------------------------- */

function TransactionsView({ accounts, categories, transactions, onEdit, onAdd, onDelete, searchInputRef }) {
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
                      <button className="icon-btn" onClick={() => onEdit(t)}><Pencil size={14} /></button>
                      <button className="icon-btn" onClick={() => onDelete(t.id)}><Trash2 size={14} /></button>
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

function BudgetsView({ categories, transactions, onAdd, onEdit, onDelete, plans, onEditPlan, onGoPlans }) {
  const activePlan = (plans || []).find((p) => p.active);

  // Only top-level categories; itemized sub-expenses roll their spend up into the parent.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  const withSpend = expenseCats.map((c) => ({ ...c, spent: categorySpend(c, transactions, plans, categories) }));
  // Gauges: general (non-plan) categories, plus the active plan's categories only - never other plans'.
  const gaugeCats = withSpend.filter((c) => c.limit > 0 && (!c.planId || (activePlan && c.planId === activePlan.id)));

  const planCats = activePlan ? withSpend.filter((c) => c.planId === activePlan.id) : [];
  // "General" means not owned by any plan at all - categories from other (inactive) plans
  // stay out of this list entirely, so they can't be edited/deleted from the Status tab.
  const generalExpenseCats = withSpend.filter((c) => !c.planId);
  const incomeCats = categories.filter((c) => c.type === "income");

  // "Uncategorized" isn't tied to any budget, so - like any category with no time
  // frame - it's scoped to a rolling 30 days rather than the calendar month.
  const rolling30Tx = transactions.filter((t) => t.type === "expense" && isWithinRolling30Days(t.date));
  const uncategorizedSpent = rolling30Tx.filter((t) => !t.categoryId).reduce((s, t) => s + t.amount, 0);
  const totalRollingSpent = rolling30Tx.reduce((s, t) => s + t.amount, 0);

  const renderCategoryRows = (list) => list.map((c) => (
    <tr key={c.id}>
      <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
      <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
      <td className="amount col-center">{c.type === "expense" ? fmt(c.spent) : "—"}</td>
      <td className="amount col-center">{c.type === "expense" ? (c.limit > 0 ? fmt(c.limit) : <span className="muted">Not set</span>) : "—"}</td>
      <td className={`amount col-center ${c.type === "expense" && c.limit > 0 && c.limit - c.spent < 0 ? "tone-rust" : ""}`}>
        {c.type === "expense" && c.limit > 0 ? fmt(c.limit - c.spent) : "—"}
      </td>
      <td className="row-actions-cell">
        <div className="row-actions">
          <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={14} /></button>
          <button className="icon-btn" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
        </div>
      </td>
    </tr>
  ));

  const renderPlanCategoryRows = (list) => list.map((c) => (
    <StatusPlanCategoryRow key={c.id} category={c} categories={categories} transactions={transactions} plans={plans} />
  ));

  return (
    <div className="budget-view">
      {activePlan ? (
        <div className="card plan-active-card">
          <div className="card-title">
            Active budget
            <button className="btn btn-ghost btn-sm" onClick={() => onEditPlan(activePlan)}><Pencil size={14} /> Edit budget</button>
          </div>
          <div className="plan-active-name">{activePlan.name}</div>
          {(activePlan.startDate || activePlan.endDate) && (
            <div className="plan-card-dates muted">
              {activePlan.startDate ? fmtDate(activePlan.startDate) : "No start"} – {activePlan.endDate ? fmtDate(activePlan.endDate) : "No end"}
            </div>
          )}
          <div className="plan-card-stats">
            <div>
              <div className="plan-stat-label">Income</div>
              <div className="plan-stat-value">{fmt(activePlan.income)}</div>
            </div>
            <div>
              <div className="plan-stat-label">Allocated</div>
              <div className="plan-stat-value">{fmt(planAllocated(activePlan))}</div>
            </div>
            <div>
              <div className="plan-stat-label">Remaining to allocate</div>
              <div className={`plan-stat-value ${(Number(activePlan.income) || 0) - planAllocated(activePlan) < 0 ? "tone-rust" : "tone-teal"}`}>
                {fmt((Number(activePlan.income) || 0) - planAllocated(activePlan))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card plan-active-card plan-active-empty">
          <div className="plan-empty-text">
            <div className="plan-empty-title">No active budget</div>
            <p className="settings-desc">Create a budget each payday to break your income down into spending categories, then mark it active to see it here.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onGoPlans}><ClipboardList size={14} /> Go to Budgets</button>
        </div>
      )}

      {(gaugeCats.length > 0 || uncategorizedSpent > 0) && (
        <div className="card">
          <div className="card-title">Category gauges</div>
          <div className="gauge-row">
            {gaugeCats.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
            {uncategorizedSpent > 0 && (
              <Gauge
                spent={uncategorizedSpent}
                limit={totalRollingSpent}
                label="Uncategorized"
                footnote={`${Math.round((uncategorizedSpent / totalRollingSpent) * 100)}% of spending`}
              />
            )}
          </div>
        </div>
      )}

      <div className="card no-pad">
        <div className="card-title padded">
          Budget categories
          {activePlan && <button className="btn btn-ghost btn-sm" onClick={() => onEditPlan(activePlan)}><Pencil size={14} /> Edit budget</button>}
        </div>
        {activePlan && planCats.length > 0 ? (
          <table className="table full">
            <thead><tr><th>Name</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th></tr></thead>
            <tbody>{renderPlanCategoryRows(planCats)}</tbody>
          </table>
        ) : (
          <p className="settings-desc plan-cats-empty">
            {activePlan ? "This budget doesn't have any categories yet. Add some from the Edit budget button above." : "Set a budget active on the Budgets page to see its categories here."}
          </p>
        )}
      </div>

      <div className="card no-pad">
        <div className="card-title padded">
          General categories
          <button className="btn btn-ghost btn-sm" onClick={onAdd}><Plus size={14} /> Add category</button>
        </div>
        <table className="table full">
          <thead><tr><th>Name</th><th>Type</th><th className="col-center">Spent</th><th className="col-center">Budgeted</th><th className="col-center">Remaining</th><th></th></tr></thead>
          <tbody>
            {renderCategoryRows(generalExpenseCats)}
            {incomeCats.map((c) => (
              <tr key={c.id}>
                <td><span className="legend-dot" style={{ background: c.color, marginRight: 8 }} />{c.name}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{c.type}</td>
                <td className="amount col-center">—</td>
                <td className="amount col-center">—</td>
                <td className="amount col-center">—</td>
                <td className="row-actions-cell">
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => onEdit(c)}><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => onDelete(c.id)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Renders one row of the Status page's "Budget categories" table. Behaves like a
// plain row for bulk categories, but for itemized categories (ones with mirrored
// sub-expense categories) it becomes a click-to-expand parent row plus one sub-row
// per item - matching the expand/collapse UX on the Budgets page.
function StatusPlanCategoryRow({ category, categories, transactions, plans }) {
  const [expanded, setExpanded] = useState(false);
  const items = categories.filter((cc) => cc.parentCategoryId === category.id);
  const isItemized = items.length > 0;

  if (!isItemized) {
    return (
      <tr>
        <td>{category.name}</td>
        <td className="amount col-center">{fmt(category.spent)}</td>
        <td className="amount col-center">{category.limit > 0 ? fmt(category.limit) : <span className="muted">Not set</span>}</td>
        <td className={`amount col-center ${category.limit > 0 && category.limit - category.spent < 0 ? "tone-rust" : ""}`}>
          {category.limit > 0 ? fmt(category.limit - category.spent) : "—"}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="plan-cat-parent-row" onClick={() => setExpanded((e) => !e)}>
        <td>
          <span className="plan-cat-expand-cell">
            <ChevronRight size={13} className={`plan-cat-chevron${expanded ? " expanded" : ""}`} />
            {category.name}
          </span>
        </td>
        <td className="amount col-center">{fmt(category.spent)}</td>
        <td className="amount col-center">{category.limit > 0 ? fmt(category.limit) : <span className="muted">Not set</span>}</td>
        <td className={`amount col-center ${category.limit > 0 && category.limit - category.spent < 0 ? "tone-rust" : ""}`}>
          {category.limit > 0 ? fmt(category.limit - category.spent) : "—"}
        </td>
      </tr>
      {expanded && items.map((it) => {
        const itSpent = categorySpend(it, transactions, plans, categories);
        const itRemaining = it.limit - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="plan-cat-item-subrow">
            <td className="plan-cat-item-name-cell">{it.name}</td>
            <td className="amount col-center">{fmt(itSpent)}</td>
            <td className="amount col-center">{it.limit > 0 ? fmt(it.limit) : <span className="muted">Not set</span>}</td>
            <td className={`amount col-center ${itOver ? "tone-rust" : ""}`}>{it.limit > 0 ? fmt(itRemaining) : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}

/* ---------------------------------- plans view ---------------------------------- */

// Renders a plan's budget categories as a table with Name / Date / Spent / Budgeted /
// Remaining columns. Bulk categories are a single row; itemized categories get a
// summary row (click to expand) plus one row per sub-expense, each with its own
// optional renewal date, spent, budgeted amount, and remaining balance.
function PlanCategoryTable({ categories, transactions }) {
  return (
    <table className="table plan-cat-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Date</th>
          <th className="col-center">Spent</th>
          <th className="col-center">Budgeted</th>
          <th className="col-center">Remaining</th>
        </tr>
      </thead>
      <tbody>
        {categories.map((c) => <PlanCategoryRows key={c.id} category={c} transactions={transactions} />)}
      </tbody>
    </table>
  );
}

function spendForCategoryId(transactions, categoryId) {
  if (!categoryId) return 0;
  return transactions.filter((t) => isSpendTx(t) && t.categoryId === categoryId).reduce((s, t) => s + t.amount, 0);
}

// Total actual spend logged against a plan, across all its categories (and, for
// itemized categories, their line-item sub-categories). Mirrors the per-row logic
// in PlanCategoryRows so the dashboard's "spent" figure always matches the Budgets tab.
function planTotalSpent(plan, transactions) {
  return (plan.categories || []).reduce((total, c) => {
    const items = c.items || [];
    const relevantIds = [c.categoryId, ...items.map((i) => i.categoryId)].filter(Boolean);
    if (!relevantIds.length) return total;
    return total + transactions.filter((t) => isSpendTx(t) && relevantIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0);
  }, 0);
}

function PlanCategoryRows({ category, transactions }) {
  const [expanded, setExpanded] = useState(false);
  const budgeted = planCategoryTotal(category);
  const items = category.items || [];
  const isItemized = category.mode === "items" && items.length > 0;

  // Now that itemized expenses are their own selectable sub-categories, the parent's
  // spend rolls up from both direct transactions and any of its item sub-categories.
  const relevantIds = [category.categoryId, ...items.map((i) => i.categoryId)].filter(Boolean);
  const spent = relevantIds.length
    ? transactions.filter((t) => isSpendTx(t) && relevantIds.includes(t.categoryId)).reduce((s, t) => s + t.amount, 0)
    : null;
  const remaining = spent !== null ? budgeted - spent : null;
  const over = remaining !== null && remaining < 0;

  if (!isItemized) {
    return (
      <tr>
        <td>{category.name}</td>
        <td className="muted">{category.date ? fmtDate(category.date) : "—"}</td>
        <td className="amount col-center">{spent !== null ? fmt(spent) : "—"}</td>
        <td className="amount col-center">{fmt(budgeted)}</td>
        <td className={`amount col-center ${over ? "tone-rust" : ""}`}>{remaining !== null ? fmt(remaining) : "—"}</td>
      </tr>
    );
  }

  return (
    <>
      <tr className="plan-cat-parent-row" onClick={() => setExpanded((e) => !e)}>
        <td>
          <span className="plan-cat-expand-cell">
            <ChevronRight size={13} className={`plan-cat-chevron${expanded ? " expanded" : ""}`} />
            {category.name}
          </span>
        </td>
        <td className="muted">—</td>
        <td className="amount col-center">{spent !== null ? fmt(spent) : "—"}</td>
        <td className="amount col-center">{fmt(budgeted)}</td>
        <td className={`amount col-center ${over ? "tone-rust" : ""}`}>{remaining !== null ? fmt(remaining) : "—"}</td>
      </tr>
      {expanded && items.map((it) => {
        const itBudget = Number(it.amount) || 0;
        const itSpent = spendForCategoryId(transactions, it.categoryId);
        const itRemaining = itBudget - itSpent;
        const itOver = itRemaining < 0;
        return (
          <tr key={it.id} className="plan-cat-item-subrow">
            <td className="plan-cat-item-name-cell">{it.name}</td>
            <td className="muted">{it.date ? fmtDate(it.date) : "—"}</td>
            <td className="amount col-center">{fmt(itSpent)}</td>
            <td className="amount col-center">{fmt(itBudget)}</td>
            <td className={`amount col-center ${itOver ? "tone-rust" : ""}`}>{fmt(itRemaining)}</td>
          </tr>
        );
      })}
    </>
  );
}


function PlansView({ plans, transactions, onAdd, onEdit, onDelete, onSetActive, onDuplicate }) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No budgets yet"
        message="Create a budget every payday to break your income down into spending categories before you spend against it."
        actionLabel="Create budget"
        onAction={onAdd}
      />
    );
  }

  const sorted = [...plans].sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));

  return (
    <div className="plans-view">
      <div className="plans-header">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> New budget</button>
      </div>
      <div className="plans-list">
        {sorted.map((p) => {
          const allocated = planAllocated(p);
          const remaining = (Number(p.income) || 0) - allocated;
          return (
            <div key={p.id} className={`plan-card ${p.active ? "plan-active" : ""}`}>
              <div className="plan-card-top">
                <div className="plan-card-name">
                  {p.name}
                  {p.active && <span className="pill plan-active-pill"><CheckCircle2 size={11} /> Active</span>}
                  {p.repeat && p.repeat.enabled && (
                    <span className="pill"><Repeat size={11} /> {REPEAT_LABELS[p.repeat.frequency] || "Repeats"}</span>
                  )}
                </div>
                <div className="row-actions">
                  <button className="icon-btn" title="Duplicate budget" onClick={() => onDuplicate(p.id)}><Copy size={14} /></button>
                  <button className="icon-btn" title="Edit budget" onClick={() => onEdit(p)}><Pencil size={14} /></button>
                  <button className="icon-btn" title="Delete budget" onClick={() => onDelete(p.id)}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="plan-card-dates muted">
                Created {fmtDate(p.dateCreated)}
                {(p.startDate || p.endDate) && (
                  <> · {p.startDate ? fmtDate(p.startDate) : "No start"} – {p.endDate ? fmtDate(p.endDate) : "No end"}</>
                )}
              </div>
              <div className="plan-card-stats">
                <div>
                  <div className="plan-stat-label">Income</div>
                  <div className="plan-stat-value">{fmt(p.income)}</div>
                </div>
                <div>
                  <div className="plan-stat-label">Allocated</div>
                  <div className="plan-stat-value">{fmt(allocated)}</div>
                </div>
                <div>
                  <div className="plan-stat-label">Remaining</div>
                  <div className={`plan-stat-value ${remaining < 0 ? "tone-rust" : "tone-teal"}`}>{fmt(remaining)}</div>
                </div>
              </div>
              {p.categories && p.categories.length > 0 && (
                <div className="plan-card-catlist">
                  <PlanCategoryTable categories={p.categories} transactions={transactions} />
                </div>
              )}
              <div className="plan-card-footer">
                <button className={`btn btn-sm ${p.active ? "btn-ghost" : "btn-primary"}`} onClick={() => onSetActive(p.id)}>
                  {p.active ? "Unset active" : "Set active"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------- modals ---------------------------------- */

function TransactionModal({ initial, accounts, categories, plans, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [type, setType] = useState(initial.type || "expense");
  const [date, setDate] = useState(initial.date || todayStr());
  const [description, setDescription] = useState(initial.description || "");
  const [amount, setAmount] = useState(initial.amount ?? "");
  const [accountId, setAccountId] = useState(initial.accountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(initial.toAccountId || "");
  const [categoryId, setCategoryId] = useState(initial.categoryId || "");

  // A category that's mirrored from a budget (planId set) should only be pickable
  // while that budget is the active one - once a budget is deactivated its
  // categories stay in state (so existing transactions still resolve their name),
  // but they shouldn't keep showing up as choices for new/edited transactions.
  const activePlanId = (plans || []).find((p) => p.active)?.id;
  const isSelectable = (c) => !c.planId || c.planId === activePlanId;

  // Top-level categories selectable for this transaction type. Transfers aren't
  // inherently income or expense, so any top-level category can be used to tag them.
  const parentCategories = categories.filter((c) => (type === "transfer" ? true : c.type === type) && !c.parentCategoryId && isSelectable(c));
  // The currently selected category might itself be a specific expense (a sub-category);
  // resolve which parent it belongs to so both dropdowns stay in sync.
  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const selectedParentId = selectedCategory ? (selectedCategory.parentCategoryId || selectedCategory.id) : "";
  const subCategories = selectedParentId ? categories.filter((c) => c.parentCategoryId === selectedParentId) : [];

  // "General <parent>" isn't a selectable specific expense - if the chosen category has
  // sub-items, the transaction must point at one of them, so default to the first as soon
  // as the current selection isn't one (e.g. right after picking a parent that has items).
  useEffect(() => {
    if (subCategories.length > 0 && !subCategories.some((c) => c.id === categoryId)) {
      setCategoryId(subCategories[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentId, subCategories.length]);

  // If the transaction type changes (e.g. expense -> income) after a category was
  // already picked, that category may no longer be valid for the new type (income
  // categories shouldn't end up on expense transactions and vice versa). Clear it so
  // the dropdown falls back to "Uncategorized" instead of silently saving a mismatched,
  // now-invisible category selection.
  useEffect(() => {
    if (!categoryId || type === "transfer") return;
    const cat = categories.find((c) => c.id === categoryId);
    const parent = cat ? (cat.parentCategoryId ? categories.find((c) => c.id === cat.parentCategoryId) : cat) : null;
    if (!parent || parent.type !== type) setCategoryId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const canSave = amount && parseFloat(amount) > 0 && accountId && (type !== "transfer" || (toAccountId && toAccountId !== accountId));

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial.id || uid(),
      type, date, description: description.trim(),
      amount: Math.abs(parseFloat(amount)),
      accountId,
      toAccountId: type === "transfer" ? toAccountId : null,
      categoryId: categoryId || null,
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
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={blurOnWheel} />
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
              <select className="select" value={selectedParentId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {type === "transfer" && (
          <div className="form-group">
            <label>Category (optional)</label>
            <select className="select" value={selectedParentId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {subCategories.length > 0 && (
          <div className="form-group">
            <label>Specific expense</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
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
          <label>{isCredit ? (isEdit ? "Starting balance owed" : "Current balance owed") : isEdit ? "Starting balance" : "Current balance"}</label>
          <input type="number" step="0.01" className="input mono" placeholder="0.00" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} onWheel={blurOnWheel} />
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
      planId: initial.planId ?? null,
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
            <input type="number" min="0" step="1" className="input mono" placeholder="0.00" value={limit} onChange={(e) => setLimit(e.target.value)} onWheel={blurOnWheel} />
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

/* ---------------------------------- plan modal ---------------------------------- */

function PlanModal({ initial, onSave, onClose, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || "");
  const [startDate, setStartDate] = useState(initial.startDate || "");
  const [endDate, setEndDate] = useState(initial.endDate || "");
  // Income as a list of named lines (e.g. "Paycheck 1", "Rollover from last month")
  // instead of a single number, so multiple sources add up naturally. Falls back
  // to one line seeded from the old single `income` field for plans saved before
  // this existed, so it behaves exactly like the old single field until someone
  // actually adds a second line.
  const [incomeItems, setIncomeItems] = useState(
    initial.incomeItems && initial.incomeItems.length
      ? initial.incomeItems
      : [{ id: uid(), name: "Income", amount: initial.income ?? "" }]
  );
  const [cats, setCats] = useState(
    initial.categories && initial.categories.length ? initial.categories : []
  );
  const [repeatOn, setRepeatOn] = useState(!!(initial.repeat && initial.repeat.enabled));
  const [repeatFreq, setRepeatFreq] = useState((initial.repeat && initial.repeat.frequency) || "monthly");

  const canRepeat = !!(startDate && endDate);
  const matchDays = planMatchDurationDays({ startDate, endDate });
  // The day-of-month a monthly repeat should keep aiming for. Preserved from the
  // plan being edited so an already-repeating budget doesn't lose its original
  // anchor (e.g. the 31st) just because a prior cycle landed on a clamped date;
  // only defaults from the current startDate for plans that haven't repeated yet.
  const repeatAnchorDay = (initial.repeat && initial.repeat.anchorDay) || (startDate ? new Date(startDate + "T00:00:00").getDate() : null);
  // Live preview, in the Edit budget menu, of when this cycle becomes due to
  // repeat and what dates the next cycle would have - mirrors planDueDate /
  // nextPlanDates exactly, using the form's current (possibly unsaved) values.
  const repeatPreview = canRepeat
    ? (() => {
        const due = planDueDate({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
        const next = nextPlanDates({ startDate, endDate, repeat: { frequency: repeatFreq, anchorDay: repeatAnchorDay } });
        return due && next ? { due, next } : null;
      })()
    : null;
  // Fixed-interval repeats (weekly/biweekly/monthly) become due at a set point
  // after the start date, regardless of how long this budget's own time frame
  // is. If that due date lands before the budget's own end date, the next cycle
  // will kick off - and roll this one to inactive - before it reaches its end
  // date. "Match time frame" can't hit this, since its due date is always the
  // end date itself.
  const repeatCutoffWarning = canRepeat && repeatOn && repeatFreq !== "match" && repeatPreview && repeatPreview.due < endDate;

  const canSave = name.trim().length > 0;
  const totalIncome = incomeItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const allocated = cats.reduce((s, c) => s + planCategoryTotal(c), 0);
  const remaining = totalIncome - allocated;

  const addIncomeItem = () => {
    setIncomeItems((items) => [...items, { id: uid(), name: "", amount: "" }]);
  };
  const updateIncomeItem = (id, patch) => {
    setIncomeItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };
  const removeIncomeItem = (id) => {
    // Always leave at least one line so there's somewhere to enter an amount.
    setIncomeItems((items) => (items.length > 1 ? items.filter((it) => it.id !== id) : items));
  };

  const addCategory = () => {
    setCats((cs) => [...cs, { id: uid(), name: "", mode: "bulk", bulkAmount: 0, date: "", items: [] }]);
  };
  // Moves a category up/down by one slot for reordering.
  const moveCategory = (id, direction) => {
    setCats((cs) => {
      const index = cs.findIndex((c) => c.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= cs.length) return cs;
      const next = [...cs];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };
  const updateCategory = (id, patch) => {
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCategory = (id) => {
    setCats((cs) => cs.filter((c) => c.id !== id));
  };
  const addItem = (catId) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: [...(c.items || []), { id: uid(), name: "", amount: 0, date: "" }] } : c)));
  };
  const updateItem = (catId, itemId, patch) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: (c.items || []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : c)));
  };
  const removeItem = (catId, itemId) => {
    setCats((cs) => cs.map((c) => (c.id === catId ? { ...c, items: (c.items || []).filter((i) => i.id !== itemId) } : c)));
  };

  const submit = () => {
    if (!canSave) return;
    const cleanedIncomeItems = incomeItems.map((it) => ({ id: it.id, name: it.name.trim() || "Income", amount: Number(it.amount) || 0 }));
    onSave({
      id: initial.id || uid(),
      name: name.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
      income: cleanedIncomeItems.reduce((s, it) => s + it.amount, 0),
      incomeItems: cleanedIncomeItems,
      dateCreated: initial.dateCreated || todayStr(),
      active: initial.active || false,
      repeat: { enabled: canRepeat && repeatOn, frequency: repeatFreq, anchorDay: repeatAnchorDay },
      categories: cats.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        name: c.name.trim() || "Untitled category",
        mode: c.mode === "items" ? "items" : "bulk",
        bulkAmount: Number(c.bulkAmount) || 0,
        date: c.date || null,
        items: (c.items || []).map((i) => ({ id: i.id, categoryId: i.categoryId, name: i.name.trim() || "Untitled expense", amount: Number(i.amount) || 0, date: i.date || null })),
      })),
    });
  };

  return (
    <Modal title={isEdit ? "Edit budget" : "New budget"} onClose={onClose} wide>
      <div className="modal-body">
        <div className="form-group">
          <label>Budget name</label>
          <input className="input" placeholder="e.g. July 5 Paycheck" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Start date (optional)</label>
            <input type="date" className="input mono" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End date (optional)</label>
            <input type="date" className="input mono" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Income</label>
          <div className="plan-items">
            {incomeItems.map((it) => (
              <div key={it.id} className="plan-item-row">
                <input className="input" placeholder="e.g. Paycheck 1, Rollover from last month" value={it.name} onChange={(e) => updateIncomeItem(it.id, { name: e.target.value })} />
                <input type="number" min="0" step="0.01" className="input mono plan-item-amount" placeholder="0.00" value={it.amount} onChange={(e) => updateIncomeItem(it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                {incomeItems.length > 1 && (
                  <button type="button" className="icon-btn" onClick={() => removeIncomeItem(it.id)}><X size={14} /></button>
                )}
              </div>
            ))}
            <div className="plan-items-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={addIncomeItem}><Plus size={13} /> Add income source</button>
              {incomeItems.length > 1 && <div className="plan-cat-subtotal muted">Total income: {fmt(totalIncome)}</div>}
            </div>
          </div>
        </div>

        <div className="plan-repeat-block">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={repeatOn}
              disabled={!canRepeat}
              onChange={(e) => setRepeatOn(e.target.checked)}
            />
            Repeat this plan
          </label>
          {!canRepeat && <p className="settings-desc">Set both a start and end date to enable repeating.</p>}
          {canRepeat && repeatOn && (
            <div className="seg plan-repeat-seg">
              <button type="button" className={`seg-btn ${repeatFreq === "weekly" ? "active" : ""}`} onClick={() => setRepeatFreq("weekly")}>Weekly</button>
              <button type="button" className={`seg-btn ${repeatFreq === "biweekly" ? "active" : ""}`} onClick={() => setRepeatFreq("biweekly")}>Every 2 weeks</button>
              <button type="button" className={`seg-btn ${repeatFreq === "monthly" ? "active" : ""}`} onClick={() => setRepeatFreq("monthly")}>Monthly</button>
              <button type="button" className={`seg-btn ${repeatFreq === "match" ? "active" : ""}`} onClick={() => setRepeatFreq("match")}>Match time frame</button>
            </div>
          )}
          {canRepeat && repeatOn && repeatPreview && (
            <p className="settings-desc">
              {repeatFreq === "match"
                ? `The budget will repeat once it's set to end, on ${fmtDate(endDate)}. `
                : `The budget will repeat ${REPEAT_DUE_PHRASES[repeatFreq]} its start date, on ${fmtDate(repeatPreview.due)}. `}
              When it repeats, the new budget will run for the same length of time as this one ({matchDays} day{matchDays === 1 ? "" : "s"}), starting {fmtDate(repeatPreview.next.startDate)} and ending {fmtDate(repeatPreview.next.endDate)}, carrying forward the same income and categories as a new plan.
            </p>
          )}
          {repeatCutoffWarning && (
            <p className="settings-desc inline-error">
              Warning: This budget runs is set to run for {matchDays} day{matchDays === 1 ? "" : "s"} (Ending on {fmtDate(endDate)}). Repeating {REPEAT_DUE_PHRASES[repeatFreq]} its start date means the next cycle begins on {fmtDate(repeatPreview.due)}. This budget will be cut off and end early.
            </p>
          )}
        </div>

        <div className="plan-summary-bar">
          <div><span className="muted">Income</span><strong>{fmt(totalIncome)}</strong></div>
          <div><span className="muted">Allocated</span><strong>{fmt(allocated)}</strong></div>
          <div>
            <span className="muted">Remaining</span>
            <strong className={remaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(remaining)}</strong>
          </div>
        </div>

        <div className="plan-categories">
          <div className="plan-categories-header">
            <div className="card-title" style={{ marginBottom: 0 }}>Budget categories</div>
          </div>
          {cats.length === 0 && (
            <p className="settings-desc">No categories yet - break your income down into spending buckets, like Rent or Groceries.</p>
          )}
          {cats.map((c, ci) => (
            <div
              key={c.id}
              className="plan-cat-block"
            >
              <div className="plan-cat-row">
                <div className="plan-cat-move-btns">
                  <button
                    type="button"
                    className="icon-btn plan-cat-move-btn"
                    title="Move category up"
                    aria-label="Move category up"
                    disabled={ci === 0}
                    onClick={() => moveCategory(c.id, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn plan-cat-move-btn"
                    title="Move category down"
                    aria-label="Move category down"
                    disabled={ci === cats.length - 1}
                    onClick={() => moveCategory(c.id, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <input className="input" placeholder="Category name (e.g. Streaming services)" value={c.name} onChange={(e) => updateCategory(c.id, { name: e.target.value })} />
                <div className="seg plan-cat-seg">
                  <button type="button" className={`seg-btn ${c.mode !== "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "bulk" })}>Bulk</button>
                  <button type="button" className={`seg-btn ${c.mode === "items" ? "active" : ""}`} onClick={() => updateCategory(c.id, { mode: "items" })}>Itemized</button>
                </div>
                <button type="button" className="icon-btn" onClick={() => removeCategory(c.id)}><Trash2 size={14} /></button>
              </div>
              {c.mode === "items" ? (
                <div className="plan-items">
                  {(c.items || []).map((it) => (
                    <div key={it.id} className="plan-item-row">
                      <input className="input" placeholder="Expense (e.g. Netflix)" value={it.name} onChange={(e) => updateItem(c.id, it.id, { name: e.target.value })} />
                      <input type="date" className="input mono plan-item-date" title="Renewal date (optional)" value={it.date || ""} onChange={(e) => updateItem(c.id, it.id, { date: e.target.value })} />
                      <input type="number" min="0" step="0.01" className="input mono plan-item-amount" placeholder="0.00" value={it.amount} onChange={(e) => updateItem(c.id, it.id, { amount: e.target.value })} onWheel={blurOnWheel} />
                      <button type="button" className="icon-btn" onClick={() => removeItem(c.id, it.id)}><X size={14} /></button>
                    </div>
                  ))}
                  <div className="plan-items-footer">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem(c.id)}><Plus size={13} /> Add expense</button>
                    <div className="plan-cat-subtotal muted">Subtotal: {fmt(planCategoryTotal(c))}</div>
                  </div>
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group plan-cat-bulk">
                    <label>Budget amount</label>
                    <input type="number" min="0" step="0.01" className="input mono" placeholder="0.00" value={c.bulkAmount} onChange={(e) => updateCategory(c.id, { bulkAmount: e.target.value })} onWheel={blurOnWheel} />
                  </div>
                  <div className="form-group plan-cat-bulk">
                    <label>Renewal date (optional)</label>
                    <input type="date" className="input mono" value={c.date || ""} onChange={(e) => updateCategory(c.id, { date: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm plan-add-category-btn" onClick={addCategory}><Plus size={14} /> Add category</button>
        </div>
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={() => onDelete(initial.id)}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save budget</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- app root ---------------------------------- */

const STORAGE_KEY = "vault-finance-data-v1";
const THEME_KEY = "amble-theme-pref-v1";
const WIDGETS_KEY = "amble-dashboard-widgets-v1";

export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Read the saved theme preference synchronously (rather than via an async
  // window.storage.get on mount) so the very first render already comes up in the
  // right theme. Doing this asynchronously used to cause two bugs: a visible flash
  // of light mode on every load for dark-mode users, and a race where the "save
  // current theme" effect below would fire with the default value and briefly
  // overwrite a saved preference before the async load resolved.
  //
  // themeMode is the user's explicit choice: "system" | "light" | "dark". A
  // fresh install (nothing saved yet) defaults to "system" so Amble matches
  // the OS/browser preference on first boot rather than assuming light mode.
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (!raw) return "system";
      const parsed = JSON.parse(raw);
      if (parsed.mode === "system" || parsed.mode === "light" || parsed.mode === "dark") {
        return parsed.mode;
      }
      // Migrate the old boolean-only { dark } preference (pre-tri-state Amble
      // versions) into an explicit light/dark choice, preserving what the
      // user last saw rather than silently switching them to "system".
      if (typeof parsed.dark === "boolean") return parsed.dark ? "dark" : "light";
      return "system";
    } catch (e) {
      return "system";
    }
  });

  // Tracks the OS/browser prefers-color-scheme setting so "system" mode can
  // resolve to an actual theme and update live if the user changes it while
  // Amble is open.
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    try {
      return typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setSystemPrefersDark(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", handleChange);
    else mql.addListener(handleChange); // Safari <14 fallback
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handleChange);
      else mql.removeListener(handleChange);
    };
  }, []);

  const darkMode = themeMode === "system" ? systemPrefersDark : themeMode === "dark";
  const [view, setView] = useState("dashboard");
  const contentRef = useRef(null);
  // Each view (dashboard, transactions, more, etc.) reuses the same scrollable
  // .content container, so switching views would otherwise leave you exactly
  // as scrolled as you were on the previous one. Snap back to the top whenever
  // the active view changes so every view is entered fresh.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view]);
  const [txModal, setTxModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [accError, setAccError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  // Same synchronous-read pattern as darkMode above, so returning users don't see
  // every widget flash on before their saved preference (some hidden) applies.
  const [dashboardWidgets, setDashboardWidgets] = useState(() => {
    try {
      const raw = localStorage.getItem(WIDGETS_KEY);
      return raw ? { ...defaultWidgetPrefs(), ...JSON.parse(raw) } : defaultWidgetPrefs();
    } catch (e) {
      return defaultWidgetPrefs();
    }
  });
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Lets the global shortcut handler focus the transactions search box even
  // when it isn't mounted yet (e.g. Cmd+F pressed from the Dashboard) - the
  // handler flips this flag and switches views, and the effect below focuses
  // the input once the Transactions view (and its input) actually exists.
  const searchInputRef = useRef(null);
  const pendingFocusSearchRef = useRef(false);

  useEffect(() => {
    if (view === "transactions" && pendingFocusSearchRef.current) {
      pendingFocusSearchRef.current = false;
      const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [view]);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(THEME_KEY, JSON.stringify({ mode: themeMode }), false); }
      catch (e) { /* silent */ }
    })();
  }, [themeMode]);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(WIDGETS_KEY, JSON.stringify(dashboardWidgets), false); }
      catch (e) { /* silent */ }
    })();
  }, [dashboardWidgets]);

  const toggleWidget = (id) => {
    setDashboardWidgets((w) => ({ ...w, [id]: !w[id] }));
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        const raw = res && res.value ? JSON.parse(res.value) : null;
        setState(raw ? { ...defaultState(), ...raw, plans: Array.isArray(raw.plans) ? raw.plans : [] } : defaultState());
      } catch (e) {
        setState(defaultState());
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setState((s) => (s ? rolloverDuePlans(s) : s));
  }, [loaded]);

  // Re-mirror the active plan's categories on load. This is what creates the
  // per-item sub-categories (e.g. "Netflix" under "Subscriptions") that power the
  // "specific expense" submenu on transactions. It's idempotent (reuses existing
  // links, never duplicates), so it also backfills plans that were set active
  // before that feature existed, without requiring the user to manually re-save.
  useEffect(() => {
    if (!loaded) return;
    setState((s) => {
      if (!s) return s;
      const active = s.plans.find((p) => p.active);
      if (!active) return s;
      const synced = syncPlanCategories(active, s.categories);
      const unchanged =
        JSON.stringify(synced.plan) === JSON.stringify(active) &&
        JSON.stringify(synced.categories) === JSON.stringify(s.categories);
      if (unchanged) return s;
      return {
        ...s,
        plans: s.plans.map((p) => (p.id === active.id ? synced.plan : p)),
        categories: synced.categories,
        transactions: clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds),
      };
    });
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !state) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(state), false); }
      catch (e) { /* silent - keeps working in-memory */ }
    })();
  }, [state, loaded]);

  // True whenever some overlay already has the user's attention - shortcuts other
  // than Escape stay quiet in that case so they can't stack a second dialog on
  // top or fire an action the visible modal doesn't expect.
  const anyOverlayOpen =
    txModal !== null || accModal !== null || catModal !== null || planModal !== null ||
    widgetModalOpen || !!confirmDialog || shortcutsOpen;

  // This must run unconditionally on every render (it's a hook), so it's declared
  // above the loading-state early return below. It bails out immediately while
  // data is still loading - before it touches anything that's only defined further
  // down in this component (like exportTransactionsCSV) - so it stays safe even
  // on that first, pre-`state` render.
  useEffect(() => {
    if (!loaded || !state) return;

    const handleKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      if (key === "Escape") {
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (confirmDialog) { setConfirmDialog(null); return; }
        if (widgetModalOpen) { setWidgetModalOpen(false); return; }
        if (txModal !== null) { setTxModal(null); return; }
        if (accModal !== null) { setAccModal(null); setAccError(""); return; }
        if (catModal !== null) { setCatModal(null); return; }
        if (planModal !== null) { setPlanModal(null); return; }
        return;
      }

      if (anyOverlayOpen) return;

      if (mod && (key === "n" || key === "N")) {
        e.preventDefault();
        setTxModal({});
        return;
      }
      if (mod && (key === "f" || key === "F")) {
        e.preventDefault();
        if (view === "transactions") searchInputRef.current?.focus();
        else { pendingFocusSearchRef.current = true; setView("transactions"); }
        return;
      }
      if (mod && (key === "e" || key === "E")) {
        e.preventDefault();
        if (state.transactions.length > 0) exportTransactionsCSV();
        return;
      }
      if (mod && (key === "d" || key === "D")) {
        e.preventDefault();
        setThemeMode(darkMode ? "light" : "dark");
        return;
      }
      if (!mod && !isTypingTarget(document.activeElement)) {
        if (key === "?" && !e.repeat) {
          e.preventDefault();
          setShortcutsOpen(true);
          return;
        }
        const navByKey = { "1": "dashboard", "2": "transactions", "3": "accounts", "4": "budgets", "5": "plans", "6": "more" };
        if (navByKey[key]) {
          setView(navByKey[key]);
          return;
        }
      }
    };

    // Releasing "?" ends the preview - this is what makes it a "hold to see"
    // panel rather than a toggle. A window blur (e.g. alt-tabbing away while
    // still holding the key) also closes it, since no keyup will otherwise fire.
    const handleKeyUp = (e) => {
      if (e.key === "?") setShortcutsOpen(false);
    };
    const handleBlur = () => setShortcutsOpen(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [loaded, view, txModal, accModal, catModal, planModal, widgetModalOpen, confirmDialog, shortcutsOpen, darkMode, anyOverlayOpen, state?.transactions?.length]);

  if (!loaded || !state) {
    return (
      <div className={`app-loading${darkMode ? " dark" : ""}`}>
        <style>{CSS}</style>
        <Loader2 className="spin" size={22} /> Loading your data…
      </div>
    );
  }

  // Every fmt() call in the tree (including deep child components) reads this
  // module-level variable, so it must be refreshed before anything below renders.
  ACTIVE_CURRENCY = state.currency || "USD";

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
  const requestDeleteTransaction = (id) => {
    const t = state.transactions.find((x) => x.id === id);
    const label = t?.description?.trim() ? `“${t.description.trim()}”` : `this ${t?.type || ""} transaction`;
    setConfirmDialog({
      title: "Delete transaction?",
      message: `This will permanently delete ${label}. This can't be undone.`,
      onConfirm: () => { deleteTransaction(id); setConfirmDialog(null); },
    });
  };

  const saveAccount = (a) => {
    setState((s) => {
      const exists = s.accounts.some((x) => x.id === a.id);
      return { ...s, accounts: exists ? s.accounts.map((x) => x.id === a.id ? a : x) : [...s.accounts, a] };
    });
    setAccModal(null);
  };
  const deleteAccount = (id) => {
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
    setAccModal(null);
    setAccError("");
  };
  const requestDeleteAccount = (id) => {
    const a = state.accounts.find((x) => x.id === id);
    const inUse = state.transactions.some((t) => t.accountId === id || t.toAccountId === id);
    if (inUse) { setAccError("This account has transactions on it. Delete those transactions first."); return; }
    setConfirmDialog({
      title: "Delete account?",
      message: `This will permanently delete “${a?.name || "this account"}”. This can't be undone.`,
      onConfirm: () => { deleteAccount(id); setConfirmDialog(null); },
    });
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
  const requestDeleteCategory = (id) => {
    const c = state.categories.find((x) => x.id === id);
    const inUse = state.transactions.some((t) => t.categoryId === id);
    setConfirmDialog({
      title: "Delete category?",
      message: inUse
        ? `This will permanently delete “${c?.name || "this category"}”. Transactions using it will become uncategorized. This can't be undone.`
        : `This will permanently delete “${c?.name || "this category"}”. This can't be undone.`,
      onConfirm: () => { deleteCategory(id); setConfirmDialog(null); },
    });
  };

  const savePlan = (p) => {
    setState((s) => {
      // Always sync, not just when this plan happens to be the active one.
      // Otherwise, removing an item from an itemized category on a budget
      // that isn't currently active leaves its mirrored category (and any
      // transaction still linked to it) stale until the budget is reactivated.
      const synced = syncPlanCategories(p, s.categories);
      const categories = synced.categories;
      const planToSave = synced.plan;
      const transactions = clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds);
      const exists = s.plans.some((x) => x.id === planToSave.id);
      let plans = exists ? s.plans.map((x) => (x.id === planToSave.id ? planToSave : x)) : [planToSave, ...s.plans];
      if (planToSave.active) plans = plans.map((x) => (x.id === planToSave.id ? x : { ...x, active: false }));
      return { ...s, plans, categories, transactions };
    });
    setPlanModal(null);
  };
  const deletePlan = (id) => {
    setState((s) => {
      // IDs of categories owned by this plan
      const deletedCategoryIds = s.categories
        .filter((c) => c.planId === id)
        .map((c) => c.id);

      return {
        ...s,

        // Remove the plan
        plans: s.plans.filter((p) => p.id !== id),

        // Remove all categories that belong to it
        categories: s.categories.filter((c) => c.planId !== id),

        // Prevent transactions from referencing deleted categories
        transactions: s.transactions.map((t) =>
          deletedCategoryIds.includes(t.categoryId)
            ? { ...t, categoryId: null }
            : t
        ),
      };
    });

    setPlanModal(null);
  };
  const requestDeletePlan = (id) => {
    const p = state.plans.find((x) => x.id === id);
    setConfirmDialog({
      title: "Delete budget?",
      message: `This will permanently delete “${p?.name || "this budget"}” and all of its categories. Transactions assigned to those categories will become uncategorized. This can't be undone.`,
      onConfirm: () => { deletePlan(id); setConfirmDialog(null); },
    });
  };
  const setActivePlan = (id) => {
    setState((s) => {
      const target = s.plans.find((p) => p.id === id);
      if (!target || target.active) {
        // toggling off, or plan not found - just clear active flags
        return { ...s, plans: s.plans.map((p) => ({ ...p, active: p.id === id ? false : p.active })) };
      }
      const synced = syncPlanCategories(target, s.categories);
      const plans = s.plans.map((p) => (p.id === id ? { ...synced.plan, active: true } : { ...p, active: false }));
      return { ...s, plans, categories: synced.categories, transactions: clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds) };
    });
  };
  const duplicatePlan = (id) => {
    const p = state.plans.find((x) => x.id === id);
    if (!p) return;
    setPlanModal({
      name: `${p.name} (Duplicate)`,
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      income: p.income,
      incomeItems: (p.incomeItems || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount })),
      active: false,
      repeat: p.repeat ? { ...p.repeat } : { enabled: false, frequency: "monthly" },
      categories: (p.categories || []).map((c) => ({
        id: uid(),
        name: c.name,
        mode: c.mode,
        bulkAmount: c.bulkAmount,
        date: c.date || null,
        items: (c.items || []).map((i) => ({ id: uid(), name: i.name, amount: i.amount, date: i.date || null })),
      })),
    });
  };

  const setCurrency = (code) => {
    setState((s) => ({ ...s, currency: code }));
  };

  const exportJSON = () => {
    const payload = { app: "amble-finance", version: 1, exportedAt: new Date().toISOString(), data: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amble-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setState((s) => ({ ...s, lastBackupAt: new Date().toISOString() }));
  };

  const requestImportJSON = (file) => {
    (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const data = parsed && typeof parsed === "object" && parsed.data ? parsed.data : parsed;
        const valid = data && Array.isArray(data.accounts) && Array.isArray(data.categories) && Array.isArray(data.transactions);
        if (!valid) throw new Error("bad shape");
        setConfirmDialog({
          title: "Import backup?",
          message: `This will replace all current accounts, categories, transactions, and plans with the contents of “${file.name}”. This can't be undone.`,
          confirmLabel: "Import & replace",
          onConfirm: () => {
            setState({
              ...defaultState(),
              accounts: data.accounts,
              categories: data.categories,
              transactions: data.transactions,
              plans: Array.isArray(data.plans) ? data.plans : [],
              ...(data.currency ? { currency: data.currency } : {}),
              ...(data.lastBackupAt ? { lastBackupAt: data.lastBackupAt } : {}),
            });
            setConfirmDialog(null);
          },
        });
      } catch (e) {
        setConfirmDialog({
          title: "Import failed",
          message: "That file doesn't look like a valid Amble backup (.json). No changes were made.",
          confirmLabel: "OK",
          tone: "primary",
          hideCancel: true,
          onConfirm: () => setConfirmDialog(null),
        });
      }
    })();
  };

  const exportTransactionsCSV = () => {
    const accName = (id) => state.accounts.find((a) => a.id === id)?.name || "";
    const catName = (id) => state.categories.find((c) => c.id === id)?.name || "";
    const header = ["Date", "Type", "Description", "Account", "Transfer To", "Category", "Amount"];
    const rows = [...state.transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date,
        t.type,
        t.description || "",
        accName(t.accountId),
        t.type === "transfer" ? accName(t.toAccountId) : "",
        catName(t.categoryId),
        t.amount.toFixed(2),
      ]);
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amble-transactions-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestDeleteAllTransactions = () => {
    const n = state.transactions.length;
    setConfirmDialog({
      title: "Delete all transactions?",
      message: `This will permanently delete all ${n} transaction${n === 1 ? "" : "s"}. Accounts, categories, and budgets will be left in place. This can't be undone.`,
      onConfirm: () => {
        setState((s) => ({ ...s, transactions: [] }));
        setConfirmDialog(null);
      },
    });
  };

  const requestDeleteAllBudgets = () => {
    const n = state.plans.length;
    setConfirmDialog({
      title: "Delete all budgets?",
      message: `This will permanently delete all ${n} budget${n === 1 ? "" : "s"} and their categories. Transactions assigned to those categories will become uncategorized. This can't be undone.`,
      onConfirm: () => {
        setState((s) => {
          const deletedCategoryIds = s.categories.filter((c) => c.planId).map((c) => c.id);
          return {
            ...s,
            plans: [],
            categories: s.categories.filter((c) => !c.planId),
            transactions: s.transactions.map((t) => (deletedCategoryIds.includes(t.categoryId) ? { ...t, categoryId: null } : t)),
          };
        });
        setConfirmDialog(null);
      },
    });
  };

  const requestDeleteAllCategories = () => {
    const n = state.categories.length;
    setConfirmDialog({
      title: "Delete all categories?",
      message: `This will permanently delete all ${n} categor${n === 1 ? "y" : "ies"}, including any tied to your budgets. Transactions using them will become uncategorized. This can't be undone.`,
      onConfirm: () => {
        setState((s) => {
          const transactions = s.transactions.map((t) => (t.categoryId ? { ...t, categoryId: null } : t));
          // Strip the links from every plan's categories/items so they're treated as
          // brand-new the next time they're synced, instead of pointing at nothing.
          let plans = s.plans.map((p) => ({
            ...p,
            categories: (p.categories || []).map((c) => ({
              ...c,
              categoryId: undefined,
              items: (c.items || []).map((it) => ({ ...it, categoryId: undefined })),
            })),
          }));
          let categories = [];
          // Re-mirror the active budget right away so its category badges don't
          // disappear until the next reload.
          const active = plans.find((p) => p.active);
          if (active) {
            const synced = syncPlanCategories(active, categories);
            categories = synced.categories;
            plans = plans.map((p) => (p.id === active.id ? synced.plan : p));
          }
          return { ...s, categories, transactions, plans };
        });
        setConfirmDialog(null);
      },
    });
  };

  const requestResetSampleData = () => {
    setConfirmDialog({
      title: "Reset sample/default data?",
      message: "This will permanently delete all of your accounts, transactions, categories, and budgets, replacing them with Amble's starter data. Your appearance and currency preferences are kept. This can't be undone.",
      confirmLabel: "Reset data",
      onConfirm: () => {
        setState((s) => ({ ...defaultState(), currency: s.currency }));
        setConfirmDialog(null);
      },
    });
  };

  const requestFactoryReset = () => {
    setConfirmDialog({
      title: "Factory reset application?",
      message: "This will permanently erase everything, including all accounts, transactions, categories, and budgets, and reset your appearance and currency preferences, returning Amble to a fresh install. This can't be undone.",
      confirmLabel: "Factory reset",
      onConfirm: () => {
        setState(defaultState());
        setThemeMode("system");
        setView("dashboard");
        setConfirmDialog(null);
      },
    });
  };

  const netWorth = state.accounts.reduce((s, a) => s + balances[a.id], 0);

  return (
    <div className={`app-root${darkMode ? " dark" : ""}`}>
      <style>{CSS}</style>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">$</div>
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
            <button className={`nav-item ${view === "more" ? "active" : ""}`} onClick={() => setView("more")}>
              <MoreHorizontal size={18} /> <span>More</span>
            </button>
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
              <button
                className="icon-btn theme-toggle"
                onClick={() => setThemeMode(darkMode ? "light" : "dark")}
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {view === "dashboard" && (
                <button className="btn btn-ghost" onClick={() => setWidgetModalOpen(true)}><Sliders size={16} /> Customize</button>
              )}
              {view !== "more" && view !== "plans" && (
                <button className="btn btn-primary" onClick={() => setTxModal({})}><Plus size={16} /> Add transaction</button>
              )}
            </div>
          </header>
          <div className="content" ref={contentRef}>
            {view === "dashboard" && (
              <Dashboard
                accounts={state.accounts}
                categories={state.categories}
                transactions={state.transactions}
                balances={balances}
                plans={state.plans}
                onGoTx={() => { setView("accounts"); setAccModal({}); }}
                onNavigate={setView}
                widgets={dashboardWidgets}
                onCustomize={() => setWidgetModalOpen(true)}
              />
            )}
            {view === "transactions" && (
              <TransactionsView accounts={state.accounts} categories={state.categories} transactions={state.transactions} onEdit={setTxModal} onAdd={() => setTxModal({})} onDelete={requestDeleteTransaction} searchInputRef={searchInputRef} />
            )}
            {view === "accounts" && (
              <AccountsView accounts={state.accounts} balances={balances} onAdd={() => setAccModal({})} onEdit={setAccModal} onDelete={requestDeleteAccount} error={accError} />
            )}
            {view === "budgets" && (
              <BudgetsView
                categories={state.categories}
                transactions={state.transactions}
                onAdd={() => setCatModal({})}
                onEdit={setCatModal}
                onDelete={requestDeleteCategory}
                plans={state.plans}
                onEditPlan={setPlanModal}
                onGoPlans={() => setView("plans")}
              />
            )}
            {view === "plans" && (
              <PlansView
                plans={state.plans}
                transactions={state.transactions}
                onAdd={() => setPlanModal({})}
                onEdit={setPlanModal}
                onDelete={requestDeletePlan}
                onSetActive={setActivePlan}
                onDuplicate={duplicatePlan}
              />
            )}
            {view === "more" && (
              <MoreView
                onExportJSON={exportJSON}
                onImportJSON={requestImportJSON}
                onExportCSV={exportTransactionsCSV}
                transactionCount={state.transactions.length}
                themeMode={themeMode}
                onChangeThemeMode={setThemeMode}
                currency={state.currency || "USD"}
                onChangeCurrency={setCurrency}
                accountCount={state.accounts.length}
                budgetCount={state.plans.length}
                categoryCount={state.categories.length}
                dbSizeBytes={new Blob([JSON.stringify(state)]).size}
                lastBackupAt={state.lastBackupAt}
                onDeleteAllTransactions={requestDeleteAllTransactions}
                onDeleteAllBudgets={requestDeleteAllBudgets}
                onDeleteAllCategories={requestDeleteAllCategories}
                onResetSampleData={requestResetSampleData}
                onFactoryReset={requestFactoryReset}
                dashboardWidgets={dashboardWidgets}
                onToggleWidget={toggleWidget}
              />
            )}
          </div>
        </main>
      </div>

      {txModal !== null && (
        <TransactionModal
          initial={txModal}
          accounts={state.accounts}
          categories={state.categories}
          plans={state.plans}
          onSave={saveTransaction}
          onClose={() => setTxModal(null)}
          onDelete={requestDeleteTransaction}
        />
      )}
      {accModal !== null && (
        <AccountModal initial={accModal} onSave={saveAccount} onClose={() => { setAccModal(null); setAccError(""); }} onDelete={requestDeleteAccount} />
      )}
      {catModal !== null && (
        <CategoryModal initial={catModal} onSave={saveCategory} onClose={() => setCatModal(null)} onDelete={requestDeleteCategory} />
      )}
      {planModal !== null && (
        <PlanModal initial={planModal} onSave={savePlan} onClose={() => setPlanModal(null)} onDelete={requestDeletePlan} />
      )}
      {widgetModalOpen && (
        <WidgetSettingsModal widgets={dashboardWidgets} onToggle={toggleWidget} onClose={() => setWidgetModalOpen(false)} />
      )}
      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          tone={confirmDialog.tone}
          hideCancel={confirmDialog.hideCancel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------- CSS ---------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
#root { height: 100%; }

.app-root, .app-loading {
  height: 100%;
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

/* Lets native controls (scrollbars, date/select popups) pick a light or dark
   rendering that matches the app instead of always defaulting to light. */
.app-root { color-scheme: light; }
.app-root.dark { color-scheme: dark; }

/* Scrollbars, themed to match the app instead of the OS default. */
.app-root, .app-loading, .app-root * , .app-loading * {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.app-root ::-webkit-scrollbar, .app-loading ::-webkit-scrollbar { width:10px; height:10px; }
.app-root ::-webkit-scrollbar-track, .app-loading ::-webkit-scrollbar-track { background: transparent; }
.app-root ::-webkit-scrollbar-thumb, .app-loading ::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 20px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.app-root ::-webkit-scrollbar-thumb:hover, .app-loading ::-webkit-scrollbar-thumb:hover { background-color: var(--text-faint); }
.app-root ::-webkit-scrollbar-corner, .app-loading ::-webkit-scrollbar-corner { background: transparent; }

.app-shell { display: grid; grid-template-columns: 232px 1fr; height: 100vh; overflow: hidden; }

.sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; height: 100%; overflow-y: auto; }
.brand { display:flex; align-items:center; gap:10px; padding: 6px 8px 20px; }
.brand-mark { width:34px; height:34px; border-radius:8px; background: var(--brass-soft); color: var(--brass); border:1px solid var(--brass); display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:600; font-size:22px; }
.brand-name { font-family:'Fraunces',serif; font-weight:600; font-size:16px; letter-spacing: 0.14em; }
.brand-sub { font-size: 11px; color: var(--text-faint); letter-spacing:0.04em; }

.nav { display:flex; flex-direction:column; gap:2px; flex:1; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; background:transparent; border:none; color: var(--text-muted); font-size:14px; font-weight:500; cursor:pointer; text-align:left; border-left: 2px solid transparent; transition: background .15s, color .15s; }
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: var(--brass-soft); color: var(--brass); border-left: 2px solid var(--brass); }
.nav-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--brass-soft); }

.sidebar-footer { border-top:1px solid var(--border); padding-top:14px; margin-top:10px; }
.nw-label { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.06em; }
.nw-value { font-family:'JetBrains Mono',monospace; font-size:19px; font-weight:600; color:var(--brass); margin-top:2px; }

.main { display:flex; flex-direction:column; min-width:0; height:100%; min-height:0; }
.topbar { display:flex; align-items:center; justify-content:space-between; padding: 22px 32px; border-bottom:1px solid var(--border); flex-shrink:0; }
.topbar-actions { display:flex; align-items:center; gap:10px; }
.theme-toggle { border:1px solid var(--border); background: var(--surface); width:36px; height:36px; align-items:center; justify-content:center; border-radius:8px; color: var(--text-muted); }
.theme-toggle:hover { color: var(--brass); border-color: var(--brass); }
.view-title { font-family:'Fraunces',serif; font-weight:600; font-size:24px; margin:0; }
.content { padding: 24px 32px 48px; overflow-y:auto; flex:1; min-height:0; }

.btn { display:inline-flex; align-items:center; gap:6px; border-radius:8px; padding:9px 14px; font-size:13.5px; font-weight:500; cursor:pointer; border:1px solid transparent; font-family:'Inter',sans-serif; transition: filter .15s, background .15s; }
.btn-primary { background: var(--brass); color: var(--on-brass); }
.btn-primary:hover { filter: brightness(1.08); }
.btn:disabled { opacity:0.4; cursor:not-allowed; }
.btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-danger { background: var(--rust); color: #ffffff; }
.btn-danger:hover { filter: brightness(1.08); }
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
.grid-2-single { grid-template-columns: 1fr; }

.gauge-row { display:flex; gap:22px; flex-wrap:wrap; }

.dash-acc-list { display:flex; flex-direction:column; }
.dash-acc-row { display:flex; align-items:center; gap:12px; padding:10px 2px; border-bottom:1px solid var(--border); }
.dash-acc-row:last-child { border-bottom:none; }
.dash-acc-icon { background: var(--surface-2); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.dash-acc-info { flex:1; min-width:0; }
.dash-acc-name { font-size:13.5px; font-weight:600; }
.dash-acc-type { font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em; margin-top:1px; }
.dash-acc-balance { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:14px; flex-shrink:0; }

.dash-budget { display:flex; flex-direction:column; gap:12px; }
.dash-budget-name { font-family:'Fraunces',serif; font-weight:600; font-size:15.5px; }
.dash-budget-bar-track { background: var(--surface-2); border:1px solid var(--border); border-radius:8px; height:10px; overflow:hidden; }
.dash-budget-bar-fill { height:100%; border-radius:8px; transition: width .3s ease; }
.gauge { display:flex; flex-direction:column; align-items:center; width:150px; }
.gauge-amount { font-family:'JetBrains Mono',monospace; fill: var(--text); font-size:16px; font-weight:600; }
.gauge-sub { font-family:'JetBrains Mono',monospace; fill: var(--text-faint); font-size:10.5px; }
.gauge-label { font-size:12.5px; color:var(--text-muted); margin-top:2px; text-align:center; }
.gauge-over { font-size:11px; color:var(--rust); margin-top:2px; }
.gauge-remaining { font-size:11px; color:var(--text-faint); margin-top:2px; text-align:center; }

.chart-empty { color: var(--text-faint); font-size:13.5px; padding: 30px 0; text-align:center; }
.pie-wrap { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.pie-chart-wrap { flex: 1 1 180px; min-width:150px; max-width:220px; }
.pie-legend { flex:1 1 160px; display:flex; flex-direction:column; gap:7px; min-width:140px; }
.legend-row { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.legend-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.legend-name { flex:1; color:var(--text-muted); }
.legend-val { font-family:'JetBrains Mono',monospace; color:var(--text); }

.table { width:100%; border-collapse:collapse; font-size:13.5px; }
.table thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); font-weight:500; padding-bottom:8px; }
.table.full thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); font-weight:500; padding:14px 20px; border-bottom:1px solid var(--border); }
.table.full tbody td { padding:12px 20px; border-bottom:1px solid var(--border); }
.table.full tbody tr:last-child td { border-bottom:none; }
.table:not(.full) td { padding:8px 0; border-bottom:1px solid var(--border); }
.table:not(.full) tr:last-child td { border-bottom:none; }
.muted { color: var(--text-muted); }
.amount { font-family:'JetBrains Mono',monospace; font-weight:500; text-align:right; }
.col-center { text-align:center !important; }
.col-right { text-align:right !important; }
.row-actions { display:flex; gap:4px; justify-content:flex-end; }
.row-actions-cell { vertical-align:middle; }

.pill { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:3px 9px; border-radius:20px; border:1px solid var(--border); color:var(--text-muted); }
.pill-group { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }

.filter-bar { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.search-input { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:8px 12px; flex:1; min-width:220px; color:var(--text-faint); }
.search-input:focus-within { border-color: var(--brass); box-shadow: 0 0 0 3px var(--brass-soft); }
.search-input input { background:transparent; border:none; color:var(--text); font-size:13.5px; width:100%; outline:none; }
.search-input input:focus, .search-input input:focus-visible { outline:none; }
.select, .input { background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); font-size:13.5px; font-family:'Inter',sans-serif; }
.input.mono, .select.mono { font-family:'JetBrains Mono',monospace; }
/* Hide the native up/down stepper on number inputs, and stop mouse-wheel scroll
   from silently changing their value (see onWheel={blurOnWheel} on each input). */
input[type="number"] { -moz-appearance: textfield; }
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.select:hover, .input:hover { border-color: var(--text-faint); }
.select:focus, .input:focus { outline: none; border-color: var(--brass); }

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
.modal.modal-sm { max-width: 380px; }
.modal.modal-lg { max-width: 640px; }
.confirm-message { font-size:13.5px; color:var(--text-muted); line-height:1.55; margin:0; }

.plans-view { display:flex; flex-direction:column; gap:16px; }
.plans-header { display:flex; justify-content:flex-end; }
.plans-list { display:flex; flex-direction:column; gap:14px; }
.plan-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 20px; display:flex; flex-direction:column; gap:10px; }
.plan-card.plan-active { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
.plan-card-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.plan-card-name { font-family:'Fraunces',serif; font-weight:600; font-size:15.5px; display:flex; align-items:center; gap:8px; }
.plan-active-pill { border-color: var(--brass); color: var(--brass); background: var(--brass-soft); }
.plan-card-dates { font-size:12px; }
.plan-card-stats { display:flex; gap:28px; flex-wrap:wrap; }
.plan-stat-label { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em; }
.plan-stat-value { font-family:'JetBrains Mono',monospace; font-size:16.5px; font-weight:600; margin-top:2px; }
.plan-card-cats { display:flex; gap:6px; flex-wrap:wrap; }
.plan-card-footer { display:flex; justify-content:flex-end; }
.plan-card-catlist { border-top:1px solid var(--border); padding-top:10px; }
.plan-cat-table th, .plan-cat-table td { font-size:12.5px; }
.plan-cat-parent-row { cursor:pointer; }
.plan-cat-parent-row:hover { background: var(--brass-soft); }
.plan-cat-expand-cell { display:inline-flex; align-items:center; gap:6px; font-weight:500; }
.plan-cat-chevron { color: var(--text-faint); flex-shrink:0; transition: transform .15s ease; }
.plan-cat-chevron.expanded { transform: rotate(90deg); }
.plan-cat-item-subrow { background: var(--surface-2); }
.plan-cat-item-name-cell { padding-left:23px !important; color:var(--text-muted); }


.plan-active-card { display:flex; flex-direction:column; gap:10px; }
.plan-active-name { font-family:'Fraunces',serif; font-weight:600; font-size:17px; }
.plan-active-empty { flex-direction:row; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.plan-empty-text { flex:1; min-width:220px; }
.plan-empty-title { font-family:'Fraunces',serif; font-weight:600; font-size:15px; margin-bottom:4px; }
.plan-cats-empty { padding: 0 20px 20px; margin:0; }

.plan-summary-bar { display:flex; gap:24px; background: var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
.plan-summary-bar > div { display:flex; flex-direction:column; gap:2px; font-size:12px; }
.plan-summary-bar strong { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600; }
.plan-repeat-block { display:flex; flex-direction:column; gap:8px; border:1px solid var(--border); border-radius:10px; padding:12px 14px; background: var(--surface-2); }
.checkbox-row { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:500; cursor:pointer; }
.checkbox-row input[type="checkbox"] { width:15px; height:15px; accent-color: var(--brass); cursor:pointer; }

.widget-toggle-list { display:flex; flex-direction:column; }
.widget-toggle-row { display:flex; align-items:flex-start; gap:11px; padding:12px 2px; border-bottom:1px solid var(--border); cursor:pointer; }
.widget-toggle-row:last-child { border-bottom:none; }
.widget-toggle-row input[type="checkbox"] { width:15px; height:15px; margin-top:2px; accent-color: var(--brass); cursor:pointer; flex-shrink:0; }
.widget-toggle-text { display:flex; flex-direction:column; gap:2px; }
.widget-toggle-label { font-size:13.5px; font-weight:600; }
.widget-toggle-desc { font-size:12px; color:var(--text-muted); line-height:1.45; }
.plan-repeat-seg { flex-wrap:wrap; }
.plan-repeat-seg .seg-btn { flex:1 1 auto; white-space:nowrap; padding:7px 10px; }
.plan-categories { display:flex; flex-direction:column; gap:12px; }
.plan-categories-header { display:flex; align-items:center; justify-content:space-between; }
.plan-add-category-btn { align-self:flex-start; }
.plan-cat-block { border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:10px; background: var(--surface-2); }
.plan-cat-move-btns { display:flex; flex-direction:column; gap:1px; flex-shrink:0; }
.plan-cat-move-btn { width:18px; height:15px; padding:0; border-radius:4px; }
.plan-cat-move-btn:disabled { opacity:0.3; cursor:default; }
.plan-cat-row { display:flex; align-items:center; gap:8px; }
.plan-cat-row .input { flex:1; }
.plan-cat-seg { flex-shrink:0; width:160px; }
.plan-cat-bulk { margin:0; }
.plan-items { display:flex; flex-direction:column; gap:8px; }
.plan-item-row { display:flex; align-items:center; gap:8px; }
.plan-item-row .input { flex:1; }
.plan-item-amount { width:110px; flex-shrink:0; }
.plan-item-date { width:150px; flex-shrink:0; }
.plan-items-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.plan-cat-subtotal { font-size:12px; }

.more-view { display:flex; flex-direction:column; gap:16px; }
.more-tabs { max-width:360px; margin-bottom:2px; }
.settings-desc { font-size:12.5px; color:var(--text-muted); line-height:1.55; margin:0 0 12px; }
.settings-actions { display:flex; gap:8px; flex-wrap:wrap; }
.settings-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:14px; margin-bottom:14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.theme-mode-seg { flex:0 0 auto; }
.theme-mode-seg .seg-btn { white-space:nowrap; padding:7px 12px; }
.settings-row-label { font-size:13.5px; font-weight:500; margin-bottom:2px; }
.more-tab-placeholder { margin:0; }

.about-card { display:flex; flex-direction:column; gap:16px; }
.about-brand { display:flex; align-items:center; gap:14px; }
.about-brand-mark { width:44px; height:44px; font-size:26px; }
.about-app-name { font-family:'Fraunces',serif; font-weight:600; font-size:19px; }
.about-details { display:flex; flex-direction:column; }
.about-row { display:flex; align-items:center; gap:8px; padding:9px 0; border-bottom:1px solid var(--border); font-size:13px; }
.about-row > .muted:first-child { flex:0 0 140px; }
.about-row:last-child { border-bottom:none; }
.about-links { padding-top:2px; }

.kbd {
  display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px;
  padding:0 6px; border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:600;
  color: var(--text); background: var(--surface-2); border:1px solid var(--border);
  box-shadow: 0 1.5px 0 var(--border);
}
.kbd-plus { color: var(--text-faint); font-size:11px; }
.shortcuts-list { display:flex; flex-direction:column; gap:18px; }
.shortcuts-group-title { font-size:11.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color: var(--text-faint); margin-bottom:8px; }
.shortcut-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:7px 0; border-bottom:1px solid var(--border); }
.shortcut-row:last-child { border-bottom:none; }
.shortcut-label { font-size:13px; }
.shortcut-keys { display:flex; align-items:center; gap:4px; flex-shrink:0; }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--border); }
.modal-header h2 { font-family:'Fraunces',serif; font-size:17px; font-weight:600; margin:0; }
.modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:14px; }
.modal-footer { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-top:1px solid var(--border); }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group label { font-size:12px; color:var(--text-muted); }
.form-group .input, .form-group .select { width:100%; }

.seg { display:flex; background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:3px; }
.seg-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:transparent; border:none; color:var(--text-muted); padding:7px; font-size:13px; font-weight:500; text-transform:capitalize; cursor:pointer; border-radius:6px; }
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
