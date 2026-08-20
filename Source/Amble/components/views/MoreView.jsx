import React, { useState, useRef } from "react";
import {
  Trash2, AlertCircle, Download, Upload, FileSpreadsheet, Repeat, RefreshCw, Check, Database, Github, Globe, X, ScrollText
} from "lucide-react";
import { ShortcutsList } from "../common/Shortcuts";
import { APP_INFO, DASHBOARD_WIDGETS, MORE_TABS, THEME_MODE_OPTIONS } from "../../constants";
import { CURRENCIES, fmtDateTime, formatBytes } from "../../utils/format";
import { checkForUpdate } from "../../utils/updates";

// Full patch notes history, most recent first. Keep in sync with Patch notes.md.
const PATCH_NOTES = [
  {
    version: "1.6.8",
    items: [
      "Transaction searching no longer attempts to query after every keystroke.",
      "Only the transactions in view are rendered in the transactions list for better performance.",
      "The budgets view now has a limit on how many budgets it will show per page for better performance.",
      "The More section now contains a patch notes log",
    ],
  },
  {
    version: "1.6.7",
    items: [
      "Fixed category colors becoming out of sync with sub-expense colors.",
      "Fixed category color refreshes from Settings not updating everywhere.",
      "Category and sub-expense colors remain synchronized.",
    ],
  },
  {
    version: "1.6.6",
    items: [
      "Spending by Category now works without a selected budget, showing the past 30 days of spending.",
      "Added a **Check for Updates** button to the About section.",
      "Added more category color options.",
    ],
  },
  {
    version: "1.6.5",
    items: [
      "Added reordering for budget sub-expenses and income entries.",
      "Budget income entries can be linked directly to specific income transactions.",
      "Improved the Allocated vs. Spent widget with category-specific colors.",
      "Improved Status page visual consistency.",
      "Gauges widget now appears second by default.",
      "Closed accounts no longer appear in the Accounts filter.",
      "Restored the optional Edit button on budget cards.",
    ],
  },
  {
    version: "1.6.4",
    items: [
      "Spending Breakdown now shows every transaction for a selected category.",
      "Allocated vs. Spent widget now includes sub-expense status for itemized categories.",
      "Clicking outside an open filter menu closes it.",
      "Account deletion errors now appear directly in the Edit Account modal.",
      "Improved rolling budgets to use the past 30 days when no dates are specified.",
      "Fixed categories not appearing for transactions assigned to inactive budgets.",
      "Fixed backup timestamps being updated when an export was canceled or not saved.",
      "Refined Status page widgets and internal Budget/Status naming.",
    ],
  },
  {
    version: "1.6.3",
    items: [
      "Accounts, transactions, and budgets can now be edited by clicking anywhere on their cards/rows.",
      "Account editing now shows recent transactions.",
      "Edit modal headers and footers now remain fixed while scrolling.",
      "Removed dedicated Edit buttons from accounts, budgets, and transactions.",
      "Removed unnecessary Delete buttons from accounts.",
    ],
  },
  {
    version: "1.6.2",
    items: [
      "Added customization to Status page.",
      "Added Budget Progress Bar, Spending Breakdown, and Allocated vs. Spent widgets to status page.",
      "Added custom colors for budget categories.",
      "Category colors appear on the Status page and are preserved when budgets are duplicated.",
      "The ability to close accounts has now been implemented.",
      "Added a View Status shortcut to the Dashboard Gauges widget.",
    ],
  },
  {
    version: "1.6.1",
    items: [
      "Added UI indicators when a pop-out window is active.",
      "Sidebar tabs with active pop-outs show a green dot.",
      "The sidebar button changes to green and indicates when a pop-out is already open.",
    ],
  },
  {
    version: "1.6.0",
    items: [
      "Added **Pop Out Views**, allowing sidebar tabs to open in separate windows.",
      "Added income categories to budgets.",
      "Sidebar cash balance now includes Checking and Savings accounts.",
      "Rearranged the budget edit menu.",
      "Added tooltips to Income and Budget Categories sections.",
    ],
  },
  {
    version: "1.5.0",
    items: [
      "Transaction category selection now shows the amount remaining in the associated budget.",
      "Transaction descriptions automatically use the selected category when no description is entered.",
      "Added **Refresh Category Colors** button to Settings.",
      "Updated the category color palette.",
      "Restricted Amble Finance to a single application window.",
      "Added an automated GitHub Actions release pipeline for supported platforms and architectures.",
      "Fixed an issue that cause launching a second instance to appear as if it erased application data.",
      "Fixed new transactions appearing in the wrong position in the transaction list.",
    ],
  },
  {
    version: "1.4.0",
    items: [
      "Added **Cash, Asset, and Loan** account types.",
      "Added customizable sidebar sections, ordering, and bottom value.",
      "Added per-column transaction filtering.",
      "Improved tool data-source selection.",
      "Added an initial Monthly Payment value to the Credit Card Interest Calculator.",
      "Added a **Reset Filters** button for transactions.",
    ],
  },
  {
    version: "1.3.0",
    items: [
      "Added a **Tools** section with financial planning calculators.",
      "Added Compound Interest, Savings Goal, Net Worth Projection, 50/30/20 Budget Rule, Emergency Fund, Recurring Spending Audit, Debt Payoff, Credit Card Interest, and Loan/Mortgage Payoff calculators.",
      "Some calculators can automatically use data from existing accounts and transactions.",
      "Added optional account interest rates for supported calculations.",
      "Added accessibility labels to icon-only buttons.",
      "Reorganized source code for maintainability.",
      "Fixed outdated Last Backup timestamps in exported backups.",
    ],
  },
  {
    version: "1.2.0",
    items: [
      "Budgets can now be rearranged",
      "Repeated budgets now appear at the top of the budget list",
      "Added warnings when a budget will repeat before its end date",
      "Budgets will now still repeat even when inactive and hand off repeat functionality to the duplicated budget",
      "Added safeguards for repeating budgets on dates that dont appear in every month like the 31st",
      "Repeated budgets now have repeated appended to their name",
      "The budget widget now shows percentage values",
      "Added account reordering with drag and drop",
      "The accounts widget now only shows the first 3 accounts",
      "Fixed timezone issue with defailt calendar date selector",
      "Fixed an issue where repeat budgets showed the wrong start and end dates",
    ],
  },
  {
    version: "1.1.0",
    items: [
      "Added budget category reordering.",
      "Implemented configurable intervals for repeating budgets",
      "Added an **Account** column to the Transactions dashboard widget.",
      "Improved transaction-table alignment.",
      "Website and GitHub links now open in the system's default browser.",
      "Application version information is now pulled directly from `package.json`.",
    ],
  },
  {
    version: "1.0.0",
    items: [
      "First official release of Amble Finance.",
      "Added checking, savings, and credit-card account management.",
      "Added income, expense, and transfer transactions.",
      "Added transaction search and filtering.",
      "Added JSON backups and CSV exports.",
      "Added keyboard shortcuts.",
      "Local-first architecture with no accounts or cloud sync.",
      "Added Windows, macOS, and Linux support.",
    ],
  },
];

// Renders a patch note line, turning **bold** markdown spans into <strong> so
// the exact wording from Patch notes.md is preserved without showing asterisks.
function PatchNoteText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function MoreView({
  onExportJSON, onImportJSON, onExportCSV, transactionCount, themeMode, onChangeThemeMode,
  currency, onChangeCurrency, accountCount, budgetCount, categoryCount, onRefreshCategoryColors,
  dbSizeBytes, lastBackupAt,
  onDeleteAllTransactions, onDeleteAllBudgets, onDeleteAllCategories, onResetSampleData, onFactoryReset,
  dashboardWidgets, onToggleWidget,
}) {
  const [tab, setTab] = useState("settings");
  const fileInputRef = useRef(null);
  const [showAllPatchNotes, setShowAllPatchNotes] = useState(false);

  // Brief visual feedback for the "Refresh" color button: the icon spins for a
  // moment, then flips to a checkmark + "Refreshed" before settling back to idle.
  // Runs on a timer rather than waiting on the actual state update since the color
  // shuffle itself is effectively instant - this is purely to confirm to the user
  // that their click registered and did something.
  const [colorRefreshState, setColorRefreshState] = useState("idle"); // idle | spinning | done
  const colorRefreshTimerRef = useRef(null);

  const handleRefreshColors = () => {
    onRefreshCategoryColors();
    clearTimeout(colorRefreshTimerRef.current);
    setColorRefreshState("spinning");
    colorRefreshTimerRef.current = setTimeout(() => {
      setColorRefreshState("done");
      colorRefreshTimerRef.current = setTimeout(() => setColorRefreshState("idle"), 1100);
    }, 450);
  };

  // Manual update check from the About tab. Unlike the background toast check
  // in App.jsx, this always hits GitHub live (no cache/throttle) since it's a
  // one-off click, not something that could happen on every launch.
  const [updateCheck, setUpdateCheck] = useState({ status: "idle" }); // idle | checking | current | available | error
  const handleCheckForUpdate = async () => {
    setUpdateCheck({ status: "checking" });
    try {
      const result = await checkForUpdate();
      setUpdateCheck(result.hasUpdate ? { status: "available", version: result.latestVersion } : { status: "current" });
    } catch (e) {
      setUpdateCheck({ status: "error", reason: e && e.message });
    }
  };
  const updateCheckMessage = {
    idle: "Check GitHub for a newer release of Amble.",
    checking: "Checking for updates…",
    current: `You're on the latest version (v${APP_INFO.version}).`,
    available: `A newer version (v${updateCheck.version}) is available.`,
    error: updateCheck.reason === "no-release"
      ? "No published release found on GitHub."
      : updateCheck.reason === "rate-limited"
        ? "GitHub's API rate limit was hit. Try again in a few minutes."
        : "Couldn't check for updates right now.",
  }[updateCheck.status];

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
          <div className="settings-row">
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
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
            <div>
              <div className="settings-row-label">Category colors</div>
              <div className="settings-desc">Re-assigns colors across your categories, spreading them out evenly. Run it as often as you'd like.</div>
            </div>
            <button className="btn btn-ghost" onClick={handleRefreshColors}>
              {colorRefreshState === "done" ? <Check size={14} /> : <RefreshCw size={14} className={colorRefreshState === "spinning" ? "spin" : ""} />}
              {" "}{colorRefreshState === "done" ? "Refreshed" : "Refresh"}
            </button>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="card">
          <div className="card-title">Dashboard</div>
          <p className="settings-desc">Choose which widgets appear on your dashboard. Hidden widgets keep their data so nothing is deleted.</p>
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
              Export a full backup of your accounts, categories, transactions, and budgets as a
              JSON file. Use it to move your data to another computer or restore it later. Your
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
              CSV file to open in Excel, Numbers, or Google Sheets. This is one-way. It's meant
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
            <div className="about-row">
              <span className="muted">Version</span>
              <span className="about-version-value">
                {APP_INFO.version}
                <button type="button" className="whats-new-link" onClick={() => setShowAllPatchNotes(true)}>
                  <ScrollText size={12} /> What's new
                </button>
              </span>
            </div>
            <div className="about-row"><span className="muted">Developed By</span><span>{APP_INFO.maintainerName} ({APP_INFO.maintainerHandle})</span></div>
            <div className="about-row">
              <span className="muted">Updates</span>
              <span>
                {updateCheck.status === "available" ? (
                  <a className="btn btn-primary btn-sm" href={APP_INFO.downloadUrl} target="_blank" rel="noreferrer">
                    <Download size={13} /> Download v{updateCheck.version}
                  </a>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={handleCheckForUpdate} disabled={updateCheck.status === "checking"} title={updateCheckMessage}>
                    {updateCheck.status === "current" ? <Check size={13} /> : <RefreshCw size={13} className={updateCheck.status === "checking" ? "spin" : ""} />}
                    {" "}{updateCheck.status === "checking" ? "Checking…" : updateCheck.status === "current" ? "Up to date" : updateCheck.status === "error" ? "Check failed" : "Check for update"}
                  </button>
                )}
              </span>
            </div>
          </div>
          <div className="settings-actions about-links">
            <a className="btn btn-ghost" href={APP_INFO.githubUrl} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a>
            {APP_INFO.websiteUrl && (
              <a className="btn btn-ghost" href={APP_INFO.websiteUrl} target="_blank" rel="noreferrer"><Globe size={14} /> Website</a>
            )}
          </div>
        </div>
      )}

      {showAllPatchNotes && (
        <div className="modal-overlay" onClick={() => setShowAllPatchNotes(false)}>
          <div
            className="modal modal-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Patch notes"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Patch notes</h2>
              <button className="icon-btn" title="Close" aria-label="Close" onClick={() => setShowAllPatchNotes(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {PATCH_NOTES.map((entry) => (
                <div key={entry.version} className="patch-notes-version-block">
                  <div className="patch-notes-version-title">v{entry.version}</div>
                  <ul className="patch-notes-list">
                    {entry.items.map((item, i) => (
                      <li key={i}><PatchNoteText text={item} /></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setShowAllPatchNotes(false)}>Close</button>
            </div>
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
