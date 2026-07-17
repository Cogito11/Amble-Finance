import React, { useState, useRef } from "react";
import {
  Trash2, AlertCircle, Download, Upload, FileSpreadsheet, Repeat, Database, Github, Globe
} from "lucide-react";
import { ShortcutsList } from "../common/Shortcuts";
import { APP_INFO, DASHBOARD_WIDGETS, MORE_TABS, THEME_MODE_OPTIONS } from "../../constants";
import { CURRENCIES, fmtDateTime, formatBytes } from "../../utils/format";

export function MoreView({
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
