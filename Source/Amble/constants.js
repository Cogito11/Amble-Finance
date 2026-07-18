import {
  LayoutDashboard, Receipt, Wallet, Target, PiggyBank, CreditCard, Landmark, Moon, Sun, ClipboardList, Repeat, Sliders, Database, Info, Activity, Monitor, Calculator, TrendingUp, ShieldCheck, TrendingDown, Percent, BarChart3
} from "lucide-react";
import { version as appVersion } from "../package.json";

export const APP_INFO = {
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
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

// Single source of truth for every keyboard shortcut Amble supports - driving both
// the held-"?" preview and the reference list in About, so the two can never drift
// out of sync with each other.
export const SHORTCUTS = [
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
      { keys: ["6"], label: "Tools" },
      { keys: ["7"], label: "More" },
    ],
  },
];

export const ACCOUNT_ICONS = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Wallet,
  asset: TrendingUp,
  credit: CreditCard,
  loan: Landmark,
};

export const ACCOUNT_LABELS = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  asset: "Asset",
  credit: "Credit Card",
  loan: "Loan",
};

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "accounts", label: "Accounts", icon: Wallet },
  { id: "budgets", label: "Status", icon: Activity },
  { id: "plans", label: "Budgets", icon: ClipboardList },
  { id: "tools", label: "Tools", icon: Calculator },
];

export const VIEW_TITLES = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  accounts: "Accounts",
  budgets: "Status",
  plans: "Budgets",
  tools: "Tools",
  more: "More",
};

// Catalog of dashboard widgets the user can toggle on/off. `id` is the key used
// in the persisted preference object; order here also controls the order the
// checkboxes appear in the customize modal (not the render order, which stays
// fixed so the layout - stat row, then gauges, then charts, then table — always
// reads top to bottom the same way).
export const DASHBOARD_WIDGETS = [
  { id: "stats", label: "Overview stats", description: "Net worth, total assets, total debt, and this month's net" },
  { id: "accounts", label: "Accounts", description: "A quick list of your accounts and their current balances" },
  { id: "budgetProgress", label: "Active budget progress", description: "Spent vs. budgeted progress bar for your active budget" },
  { id: "budgetGauges", label: "Budget gauges", description: "Progress gauges for your top budget categories" },
  { id: "netWorthTrend", label: "Net worth trend", description: "Chart of your net worth over the last 6 months" },
  { id: "categoryPie", label: "Spending by category", description: "Pie chart breakdown of expenses, per category, over each budget's time frame (or a rolling 30 days if it has none)" },
  { id: "trend", label: "Income vs. expenses trend", description: "Bar chart comparing income and spending over the last 6 months" },
  { id: "recent", label: "Recent transactions", description: "A table of your most recent transactions" },
];

export function defaultWidgetPrefs() {
  return DASHBOARD_WIDGETS.reduce((acc, w) => { acc[w.id] = true; return acc; }, {});
}

export const MORE_TABS = [
  { id: "settings", label: "Settings", icon: Sliders },
  { id: "data", label: "Data", icon: Database },
  { id: "about", label: "About", icon: Info },
];

// The three appearance choices shown as a segmented control, matching the
// look of the Settings/Data/About tabs above. "system" tracks the OS/browser
// prefers-color-scheme setting instead of pinning to one theme.
export const THEME_MODE_OPTIONS = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

// Compounding frequency options for the compound interest calculator.
// `monthsPerPeriod` is how often (in months) interest is actually applied to
// the balance - contributions still land every month regardless of this.
export const COMPOUND_FREQUENCIES = [
  { id: "annually", label: "Annually", monthsPerPeriod: 12 },
  { id: "semiannually", label: "Semi-annually", monthsPerPeriod: 6 },
  { id: "quarterly", label: "Quarterly", monthsPerPeriod: 3 },
  { id: "monthly", label: "Monthly", monthsPerPeriod: 1 },
];

// Catalog of financial tools shown on the Tools tab, grouped into categories.
// `available: false` tools render as "Coming soon" cards so the tab can grow
// over time without every entry needing a working implementation yet.
export const TOOLS_CATALOG = [
  {
    id: "growth",
    label: "Growth & Savings",
    icon: TrendingUp,
    tools: [
      {
        id: "compound-interest",
        label: "Compound Interest Calculator",
        desc: "See how a starting balance and monthly contributions grow over time.",
        icon: TrendingUp,
        available: true,
      },
      {
        id: "savings-goal",
        label: "Savings Goal Calculator",
        desc: "Work out the monthly contribution needed to hit a target amount by a date.",
        icon: Target,
        available: true,
      },
      {
        id: "net-worth-projection",
        label: "Net Worth Projection",
        desc: "Project your net worth forward, and see what saving a bit more each month would do.",
        icon: BarChart3,
        available: true,
      },
    ],
  },
  {
    id: "budgeting",
    label: "Budgeting",
    icon: PiggyBank,
    tools: [
      {
        id: "50-30-20",
        label: "50/30/20 Budget Rule",
        desc: "Split your income into needs, wants, and savings using the classic rule of thumb.",
        icon: PiggyBank,
        available: true,
      },
      {
        id: "emergency-fund",
        label: "Emergency Fund Calculator",
        desc: "Check how many months of expenses your current savings would cover.",
        icon: ShieldCheck,
        available: true,
      },
      {
        id: "recurring-spend",
        label: "Recurring Spending Audit",
        desc: "Find recurring charges hiding in your transactions and see what they add up to.",
        icon: Repeat,
        available: true,
      },
    ],
  },
  {
    id: "debt",
    label: "Debt",
    icon: TrendingDown,
    tools: [
      {
        id: "debt-payoff",
        label: "Debt Payoff Planner",
        desc: "Compare snowball vs. avalanche strategies to see which gets you debt-free faster and cheaper.",
        icon: CreditCard,
        available: true,
      },
      {
        id: "credit-card-interest",
        label: "Credit Card Interest Calculator",
        desc: "See what a balance is really costing you in interest, and how long it'll take to pay off.",
        icon: Percent,
        available: true,
      },
      {
        id: "loan-payoff",
        label: "Loan / Mortgage Payoff Calculator",
        desc: "Get your monthly payment, full amortization schedule, and the payoff impact of extra payments.",
        icon: Landmark,
        available: true,
      },
    ],
  },
];

/* ---------------------------------- app root ---------------------------------- */
export const STORAGE_KEY = "vault-finance-data-v1";

export const THEME_KEY = "amble-theme-pref-v1";

export const WIDGETS_KEY = "amble-dashboard-widgets-v1";
