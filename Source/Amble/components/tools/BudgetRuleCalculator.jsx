import React, { useState, useEffect, useMemo } from "react";
import {
  PiggyBank, ArrowLeft
} from "lucide-react";
import { monthKeyOf } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";
import { blurOnWheel, sortTransactionsNewestFirst } from "../../utils/misc";

export function BudgetRuleCalculator({ onBack, transactions }) {
  const [income, setIncome] = useState(4500);
  const [mode, setMode] = useState("manual");
  const [txId, setTxId] = useState("");

  const incomeTransactions = useMemo(
    () => sortTransactionsNewestFirst((transactions || []).filter((t) => t.type === "income")).slice(0, 30),
    [transactions]
  );

  // Average monthly income over the most recent months that actually have
  // income transactions in them (up to 6), so a quiet month doesn't drag
  // a long-running average down and a brand-new budget still gets a number.
  const monthlyAverage = useMemo(() => {
    const byMonth = {};
    (transactions || []).filter((t) => t.type === "income").forEach((t) => {
      const mk = monthKeyOf(t.date);
      byMonth[mk] = (byMonth[mk] || 0) + t.amount;
    });
    const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
    const total = months.reduce((s, mk) => s + byMonth[mk], 0);
    return { value: months.length ? total / months.length : 0, monthsUsed: months.length };
  }, [transactions]);

  useEffect(() => {
    if (mode === "transaction" && txId) {
      const tx = incomeTransactions.find((t) => t.id === txId);
      if (tx) setIncome(tx.amount);
    } else if (mode === "average" && monthlyAverage.monthsUsed > 0) {
      setIncome(Math.round(monthlyAverage.value * 100) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, txId, monthlyAverage.value, monthlyAverage.monthsUsed]);

  const result = useMemo(() => {
    const inc = Math.max(0, Number(income) || 0);
    return {
      needs: inc * 0.5,
      wants: inc * 0.3,
      savings: inc * 0.2,
    };
  }, [income]);

  const rows = [
    { key: "needs", label: "Needs", pct: "50%", desc: "Rent, groceries, utilities, minimum debt payments", tone: "brass", value: result.needs },
    { key: "wants", label: "Wants", pct: "30%", desc: "Dining out, entertainment, subscriptions, hobbies", tone: "teal", value: result.wants },
    { key: "savings", label: "Savings & debt payoff", pct: "20%", desc: "Emergency fund, investing, extra debt payments", tone: "rust", value: result.savings },
  ];

  const hasIncomeHistory = incomeTransactions.length > 0;

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="card">
        <div className="card-title">
          <span><PiggyBank size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />50/30/20 Budget Rule</span>
          {hasIncomeHistory && (
            <div className="seg card-corner-seg" role="group" aria-label="Income source">
              <button type="button" className={`seg-btn ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>Manual</button>
              <button type="button" className={`seg-btn ${mode === "transaction" ? "active" : ""}`} onClick={() => setMode("transaction")}>From transaction</button>
              <button type="button" className={`seg-btn ${mode === "average" ? "active" : ""}`} onClick={() => setMode("average")}>Monthly average</button>
            </div>
          )}
        </div>

        {mode === "transaction" && hasIncomeHistory ? (
          <div className="form-group">
            <label>Income transaction</label>
            <select className="select" value={txId} onChange={(e) => setTxId(e.target.value)}>
              <option value="">Select a transaction…</option>
              {incomeTransactions.map((t) => (
                <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.description || "Income"} · {fmt(t.amount)}</option>
              ))}
            </select>
          </div>
        ) : mode === "average" && hasIncomeHistory ? (
          <div className="form-group">
            <label>Monthly income (after tax)</label>
            <input className="input" type="number" value={income} readOnly />
            <div className="tool-note">
              Average of {fmt(monthlyAverage.value)}/mo across the last {monthlyAverage.monthsUsed} {monthlyAverage.monthsUsed === 1 ? "month" : "months"} with income transactions.
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label>Monthly income (after tax)</label>
            <input className="input" type="number" min="0" step="50" value={income} onWheel={blurOnWheel} onChange={(e) => setIncome(e.target.value)} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Suggested split</div>
        <div className="budget-rule-rows">
          {rows.map((r) => (
            <div key={r.key} className="budget-rule-row">
              <div className="budget-rule-row-top">
                <div className="budget-rule-row-label">{r.label} <span className="muted">· {r.pct}</span></div>
                <strong className={`tone-${r.tone}`}>{fmt(r.value)}</strong>
              </div>
              <div className="dash-budget-bar-track">

                <div className="dash-budget-bar-fill" style={{ width: r.pct, background: `var(--${r.tone})` }} />
              </div>
              <div className="tool-note">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
