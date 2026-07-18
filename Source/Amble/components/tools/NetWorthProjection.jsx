import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight, ArrowLeft, TrendingUp, BarChart3
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from "recharts";
import { StatCard } from "../common/StatCard";
import { fmt } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

export function NetWorthProjection({ onBack, accounts, balances }) {
  const computedNetWorth = useMemo(
    () => (accounts || []).reduce((s, a) => s + (balances?.[a.id] || 0), 0),
    [accounts, balances]
  );
  const hasAccounts = (accounts || []).length > 0;

  const [startingNetWorth, setStartingNetWorth] = useState(hasAccounts ? Math.round(computedNetWorth * 100) / 100 : 10000);
  const [monthlySavings, setMonthlySavings] = useState(500);
  const [extra, setExtra] = useState(200);
  const [returnRate, setReturnRate] = useState(7);
  const [years, setYears] = useState(20);
  const [sourceMode, setSourceMode] = useState("manual");

  useEffect(() => {
    if (sourceMode === "accounts") setStartingNetWorth(Math.round(computedNetWorth * 100) / 100);
  }, [sourceMode, computedNetWorth]);

  const project = (monthlyAmount) => {
    const annualRate = (Number(returnRate) || 0) / 100;
    const monthlyRate = annualRate / 12;
    const n = Math.max(1, Math.round((Number(years) || 0) * 12));
    let bal = Number(startingNetWorth) || 0;
    const points = [{ year: 0, balance: Math.round(bal) }];
    for (let m = 1; m <= n; m++) {
      // Grow the existing balance first, then add this month's contribution -
      // so a contribution starts earning interest the following month, not
      // instantly on the day it's added. Matches the convention used (and
      // verified against Investor.gov's own compound interest calculator) in
      // CompoundInterestCalculator.jsx and SavingsGoalCalculator.jsx.
      bal *= 1 + monthlyRate;
      bal += Number(monthlyAmount) || 0;
      if (m % 12 === 0) points.push({ year: m / 12, balance: Math.round(bal) });
    }
    return { finalBalance: bal, points };
  };

  const current = useMemo(() => project(monthlySavings), [startingNetWorth, monthlySavings, returnRate, years]);
  const boosted = useMemo(() => project((Number(monthlySavings) || 0) + (Number(extra) || 0)), [startingNetWorth, monthlySavings, extra, returnRate, years]);

  const combined = useMemo(() => {
    const len = Math.max(current.points.length, boosted.points.length);
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push({ year: current.points[i]?.year ?? boosted.points[i]?.year, current: current.points[i]?.balance ?? null, boosted: boosted.points[i]?.balance ?? null });
    }
    return arr;
  }, [current, boosted]);

  const extraGain = boosted.finalBalance - current.finalBalance;

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><BarChart3 size={18} /> Net Worth Projection</div>

      <div className="card">
        <div className="card-title">
          <span>Starting net worth</span>
          {hasAccounts && (
            <div className="seg card-corner-seg" role="group" aria-label="Starting net worth source">
              <button type="button" className={`seg-btn ${sourceMode === "manual" ? "active" : ""}`} onClick={() => setSourceMode("manual")}>Manual</button>
              <button type="button" className={`seg-btn ${sourceMode === "accounts" ? "active" : ""}`} onClick={() => setSourceMode("accounts")}>From accounts</button>
            </div>
          )}
        </div>
        <div className="form-group">
          <input className="input" type="number" step="100" value={startingNetWorth} readOnly={sourceMode === "accounts"} onWheel={blurOnWheel} onChange={(e) => setStartingNetWorth(e.target.value)} />
          {sourceMode === "accounts" && <div className="tool-note">Your accounts currently total {fmt(computedNetWorth)} in net worth.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Savings &amp; growth assumptions</div>
        <div className="form-row">
          <div className="form-group">
            <label>Current monthly savings</label>
            <input className="input" type="number" min="0" step="25" value={monthlySavings} onWheel={blurOnWheel} onChange={(e) => setMonthlySavings(e.target.value)} />
          </div>
          <div className="form-group">
            <label>What if I saved this much more/mo</label>
            <input className="input" type="number" min="0" step="25" value={extra} onWheel={blurOnWheel} onChange={(e) => setExtra(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Expected annual return (%)</label>
            <input className="input" type="number" min="0" step="0.5" value={returnRate} onWheel={blurOnWheel} onChange={(e) => setReturnRate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Years to project</label>
            <input className="input" type="number" min="1" step="1" value={years} onWheel={blurOnWheel} onChange={(e) => setYears(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stat-row tool-result-row">
        <StatCard label={`In ${years} yrs, current pace`} value={fmt(current.finalBalance)} tone="brass" icon={TrendingUp} />
        <StatCard label={`In ${years} yrs, boosted pace`} value={fmt(boosted.finalBalance)} tone="teal" icon={BarChart3} />
        <StatCard label="Extra from saving more" value={fmt(extraGain)} tone="teal" icon={ArrowUpRight} />
      </div>

      <div className="card">
        <div className="card-title">Projected net worth over time</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={combined} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={70} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(y) => `Year ${y}`} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="current" name="Current pace" stroke="var(--brass)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="boosted" name="Boosted pace" stroke="var(--teal)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
