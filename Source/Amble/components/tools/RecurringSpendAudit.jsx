import React, { useMemo } from "react";
import {
  ArrowUpRight, Repeat, ArrowLeft
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { StatCard } from "../common/StatCard";
import { monthKeyOf } from "../../utils/dates";
import { fmt } from "../../utils/format";

export function RecurringSpendAudit({ onBack, transactions }) {
  const recurring = useMemo(() => {
    const expenseTx = (transactions || []).filter((t) => t.type === "expense" && (t.description || "").trim());
    const groups = {};
    expenseTx.forEach((t) => {
      const key = t.description.trim().toLowerCase();
      (groups[key] = groups[key] || []).push(t);
    });
    const results = [];
    Object.values(groups).forEach((txs) => {
      const monthsSeen = new Set(txs.map((t) => monthKeyOf(t.date)));
      if (monthsSeen.size < 2) return; // needs to show up in at least 2 different months
      const amounts = txs.map((t) => t.amount);
      const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const maxDev = Math.max(...amounts.map((a) => Math.abs(a - avg)));
      if (avg > 0 && maxDev / avg > 0.35) return; // amounts too inconsistent to call recurring
      results.push({ key: txs[0].description.trim().toLowerCase(), name: txs[0].description, monthlyAvg: avg, monthsSeen: monthsSeen.size });
    });
    return results.sort((a, b) => b.monthlyAvg - a.monthlyAvg);
  }, [transactions]);

  const totalMonthly = recurring.reduce((s, r) => s + r.monthlyAvg, 0);

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><Repeat size={18} /> Recurring Spend Audit</div>

      <div className="card">
        <div className="tool-note">Scans your transactions for expenses with a matching description that show up in at least two different months at a fairly consistent amount, and totals them up as likely recurring charges.</div>
      </div>

      {!recurring.length ? (
        <EmptyState icon={Repeat} title="No recurring spend detected yet" message="Once you have expenses with matching descriptions across two or more months, they'll show up here." />
      ) : (
        <>
          <div className="stat-row tool-result-row">
            <StatCard label="Recurring items found" value={recurring.length} tone="brass" icon={Repeat} />
            <StatCard label="Total per month" value={fmt(totalMonthly)} tone="rust" icon={ArrowUpRight} />
            <StatCard label="Total per year" value={fmt(totalMonthly * 12)} tone="rust" icon={ArrowUpRight} />
          </div>

          <div className="card">
            <div className="card-title">Recurring charges</div>
            <table className="table">
              <thead>
                <tr><th>Description</th><th className="col-right">Monthly</th><th className="col-right">Annual</th><th className="col-right">Months seen</th></tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td className="amount">{fmt(r.monthlyAvg)}</td>
                    <td className="amount">{fmt(r.monthlyAvg * 12)}</td>
                    <td className="col-right">{r.monthsSeen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
