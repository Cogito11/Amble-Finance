import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight, Landmark, Calculator, ArrowLeft, TrendingDown
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import { StatCard } from "../common/StatCard";
import { fmt, fmtMonths } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

// Standard amortization simulation. Returns the base (no-extra) required monthly
// payment plus a month-by-month payoff run using whatever extra payment is passed
// in, aggregated into per-year rows for the schedule table and chart.
export function computeAmortization(principal, aprPct, termYears, extra) {
  const monthlyRate = Math.max(0, Number(aprPct) || 0) / 100 / 12;
  const n = Math.max(1, Math.round((Number(termYears) || 0) * 12));
  const p = Math.max(0, Number(principal) || 0);
  const basePayment = monthlyRate > 0 ? (p * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n)) : p / n;
  const extraAmt = Math.max(0, Number(extra) || 0);

  let balance = p;
  let month = 0;
  let totalInterest = 0;
  const yearly = [];
  let yearPrincipal = 0, yearInterest = 0;
  while (balance > 0.01 && month < n) {
    month++;
    const interest = balance * monthlyRate;
    const payment = basePayment + extraAmt;
    let principalPortion = payment - interest;
    if (principalPortion > balance) principalPortion = balance;
    balance -= principalPortion;
    totalInterest += interest;
    yearPrincipal += principalPortion;
    yearInterest += interest;
    if (month % 12 === 0 || balance <= 0.01) {
      yearly.push({ year: Math.ceil(month / 12), principalPaid: Math.round(yearPrincipal), interestPaid: Math.round(yearInterest), endBalance: Math.max(0, Math.round(balance)) });
      yearPrincipal = 0; yearInterest = 0;
    }
  }
  return { basePayment, totalInterest, months: month, yearly };
}

export function LoanPayoffCalculator({ onBack, accounts, balances }) {
  const [principal, setPrincipal] = useState(300000);
  const [apr, setApr] = useState(6.5);
  const [termYears, setTermYears] = useState(30);
  const [extra, setExtra] = useState(0);
  const [accountId, setAccountId] = useState("");
  const loanAccounts = useMemo(
    () => (accounts || []).filter((a) => a.type === "loan" && Number(balances?.[a.id]) < 0),
    [accounts, balances]
  );

  useEffect(() => {
    if (!accountId || balances?.[accountId] === undefined) return;
    const account = (accounts || []).find((a) => a.id === accountId);
    setPrincipal(Math.round(Math.abs(balances[accountId]) * 100) / 100);
    if (account?.interestRate != null) setApr(account.interestRate);
  }, [accountId, accounts, balances]);

  const withExtra = useMemo(() => computeAmortization(principal, apr, termYears, extra), [principal, apr, termYears, extra]);
  const noExtra = useMemo(() => computeAmortization(principal, apr, termYears, 0), [principal, apr, termYears]);
  const interestSaved = noExtra.totalInterest - withExtra.totalInterest;
  const monthsSaved = noExtra.months - withExtra.months;

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><Landmark size={18} /> Loan / Mortgage Payoff Calculator</div>

      <div className="card">
        <div className="card-title">Loan details</div>
        {loanAccounts.length > 0 && (
          <div className="form-group">
            <label>Load a saved loan <span className="muted">· optional</span></label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Enter manually</option>
              {loanAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} · {fmt(Math.abs(balances[account.id]))}</option>
              ))}
            </select>
            {accountId && <div className="tool-note">Balance and saved APR are loaded from this account. Set the loan term below to calculate its payoff.</div>}
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Loan amount</label>
            <input className="input" type="number" min="0" step="1000" value={principal} onWheel={blurOnWheel} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Interest rate (APR %)</label>
            <input className="input" type="number" min="0" step="0.1" value={apr} onWheel={blurOnWheel} onChange={(e) => setApr(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Loan term (years)</label>
            <input className="input" type="number" min="1" step="1" value={termYears} onWheel={blurOnWheel} onChange={(e) => setTermYears(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Extra monthly payment</label>
            <input className="input" type="number" min="0" step="25" value={extra} onWheel={blurOnWheel} onChange={(e) => setExtra(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stat-row tool-result-row">
        <StatCard label="Monthly payment" value={fmt(withExtra.basePayment)} tone="brass" icon={Landmark} />
        <StatCard label="Payoff time" value={fmtMonths(withExtra.months)} tone="teal" icon={TrendingDown} />
        <StatCard label="Total interest paid" value={fmt(withExtra.totalInterest)} tone="rust" icon={ArrowUpRight} />
      </div>

      {Number(extra) > 0 && (
        <div className="card">
          <div className="tool-note">
            Paying {fmt(extra)} extra each month saves you {fmt(interestSaved)} in interest and pays the loan off {monthsSaved} {monthsSaved === 1 ? "month" : "months"} sooner than the base {fmtMonths(noExtra.months)} term.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Principal vs. interest by year</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={withExtra.yearly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={70} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(y) => `Year ${y}`} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="principalPaid" name="Principal" stackId="a" fill="var(--teal)" />
              <Bar dataKey="interestPaid" name="Interest" stackId="a" fill="var(--rust)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Yearly amortization summary</div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Year</th><th className="col-right">Principal paid</th><th className="col-right">Interest paid</th><th className="col-right">Ending balance</th></tr>
            </thead>
            <tbody>
              {withExtra.yearly.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td className="amount">{fmt(y.principalPaid)}</td>
                  <td className="amount">{fmt(y.interestPaid)}</td>
                  <td className="amount">{fmt(y.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
