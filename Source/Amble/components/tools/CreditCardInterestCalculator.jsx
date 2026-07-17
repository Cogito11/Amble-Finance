import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight, CreditCard, Calculator, ArrowLeft, Percent
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from "recharts";
import { StatCard } from "../common/StatCard";
import { fmt, fmtMonths } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

export function CreditCardInterestCalculator({ onBack, accounts, balances }) {
  const [balance, setBalance] = useState(2000);
  const [apr, setApr] = useState(24.99);
  const [payMode, setPayMode] = useState("fixed");
  const [fixedPayment, setFixedPayment] = useState(150);
  const [minPercent, setMinPercent] = useState(2);
  const [accountId, setAccountId] = useState("");

  const creditAccounts = useMemo(
    () => (accounts || []).filter((a) => a.type === "credit" && Number(balances?.[a.id]) < 0),
    [accounts, balances]
  );

  useEffect(() => {
    if (accountId && balances?.[accountId] !== undefined) {
      setBalance(Math.round(Math.abs(balances[accountId]) * 100) / 100);
      const acct = (accounts || []).find((a) => a.id === accountId);
      if (acct && acct.interestRate != null) {
        setApr(acct.interestRate);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, balances, accounts]);

  const result = useMemo(() => {
    const startBalance = Math.max(0, Number(balance) || 0);
    const rate = Math.max(0, Number(apr) || 0);
    const monthlyInterestOnStart = startBalance * (rate / 100 / 12);
    if (payMode === "fixed" && startBalance > 0 && (Number(fixedPayment) || 0) <= monthlyInterestOnStart) {
      return { stuck: true, months: 0, totalInterest: 0, points: [{ month: 0, balance: startBalance }], totalPaid: startBalance };
    }
    let bal = startBalance;
    let months = 0;
    let totalInterest = 0;
    const points = [{ month: 0, balance: bal }];
    while (bal > 0.01 && months < 600) {
      months++;
      const interest = bal * (rate / 100 / 12);
      bal += interest;
      totalInterest += interest;
      const payment = payMode === "fixed"
        ? Math.min(Number(fixedPayment) || 0, bal)
        : Math.min(bal, Math.max(bal * ((Number(minPercent) || 0) / 100), Math.min(25, bal)));
      bal -= payment;
      points.push({ month: months, balance: Math.max(0, bal) });
    }
    return { months, totalInterest, points, maxedOut: months >= 600, totalPaid: startBalance + totalInterest, stuck: false };
  }, [balance, apr, payMode, fixedPayment, minPercent]);

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><Percent size={18} /> Credit Card Interest Calculator</div>

      <div className="card">
        <div className="card-title">
          <span>Balance</span>
          {creditAccounts.length > 0 && (
            <select className="select" style={{ width: 220 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Enter manually</option>
              {creditAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {fmt(Math.abs(balances[a.id]))}</option>
              ))}
            </select>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Balance / purchase amount</label>
            <input className="input" type="number" min="0" step="10" value={balance} onWheel={blurOnWheel} onChange={(e) => { setAccountId(""); setBalance(e.target.value); }} />
          </div>
          <div className="form-group">
            <label>APR (%)</label>
            <input className="input" type="number" min="0" step="0.1" value={apr} onWheel={blurOnWheel} onChange={(e) => setApr(e.target.value)} />
            {accountId && (accounts || []).find((a) => a.id === accountId)?.interestRate != null && (
              <div className="tool-note">Pulled from the account's saved APR - edit freely.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">How you'll pay it off</div>
        <div className="seg" role="group" aria-label="Payment mode" style={{ marginBottom: 12 }}>
          <button type="button" className={`seg-btn ${payMode === "fixed" ? "active" : ""}`} onClick={() => setPayMode("fixed")}>Fixed monthly payment</button>
          <button type="button" className={`seg-btn ${payMode === "minimum" ? "active" : ""}`} onClick={() => setPayMode("minimum")}>Minimum payments only</button>
        </div>
        {payMode === "fixed" ? (
          <div className="form-group">
            <label>Monthly payment</label>
            <input className="input" type="number" min="0" step="10" value={fixedPayment} onWheel={blurOnWheel} onChange={(e) => setFixedPayment(e.target.value)} />
          </div>
        ) : (
          <div className="form-group">
            <label>Minimum payment</label>
            <input className="input" type="number" min="0" step="0.5" value={minPercent} onWheel={blurOnWheel} onChange={(e) => setMinPercent(e.target.value)} />
            <div className="tool-note">Uses whichever is greater: {minPercent || 0}% of the balance, or $25.</div>
          </div>
        )}
      </div>

      {result.stuck || result.maxedOut ? (
        <div className="card">
          <div className="tool-note" style={{ color: "var(--rust)" }}>
            {result.stuck
              ? `This payment doesn't even cover the monthly interest (${fmt(Number(balance) * (Number(apr) / 100 / 12))}/mo) - the balance will grow forever at this rate. Increase the payment to see a payoff timeline.`
              : "At this payment rate, it would take more than 50 years to pay off - increase the payment to see a realistic payoff timeline."}
          </div>
        </div>
      ) : (
        <>
          <div className="stat-row tool-result-row">
            <StatCard label="Time to pay off" value={fmtMonths(result.months)} tone="brass" icon={Percent} />
            <StatCard label="Total interest paid" value={fmt(result.totalInterest)} tone="rust" icon={ArrowUpRight} />
            <StatCard label="True total cost" value={fmt(result.totalPaid)} tone="teal" icon={CreditCard} />
          </div>

          <div className="card">
            <div className="card-title">Balance over time</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={result.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ccBalanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--rust)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--rust)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => `Mo ${m}`} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={70} />
                  <Tooltip formatter={(v) => fmt(v)} labelFormatter={(m) => `Month ${m}`} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
                  <Area type="monotone" dataKey="balance" stroke="var(--rust)" fill="url(#ccBalanceFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
