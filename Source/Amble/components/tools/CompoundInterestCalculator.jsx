import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowUpRight, PiggyBank, Calculator, ArrowLeft, TrendingUp
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from "recharts";
import { StatCard } from "../common/StatCard";
import { COMPOUND_FREQUENCIES } from "../../constants";
import { useAccountAmountField } from "../../hooks/useAccountAmountField";
import { fmt } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

export function CompoundInterestCalculator({ onBack, accounts, balances }) {
  const [principal, setPrincipal] = useState(5000);
  const [monthly, setMonthly] = useState(200);
  const [rate, setRate] = useState(6);
  const [years, setYears] = useState(15);
  const [frequency, setFrequency] = useState("annually");

  const result = useMemo(() => {
    const p = Math.max(0, Number(principal) || 0);
    const c = Math.max(0, Number(monthly) || 0);
    const annualRate = (Number(rate) || 0) / 100;
    const n = Math.max(1, Math.round((Number(years) || 0) * 12));
    const freq = COMPOUND_FREQUENCIES.find((f) => f.id === frequency) || COMPOUND_FREQUENCIES[0];
    const monthsPerPeriod = freq.monthsPerPeriod;
    // Rate applied each time interest compounds, scaled to that period's length.
    const periodRate = annualRate * (monthsPerPeriod / 12);

    let balance = p;
    let contributions = p;
    let monthsSincePeriodStart = 0;
    const points = [{ year: 0, balance: p, contributions: p }];
    for (let m = 1; m <= n; m++) {
      balance += c;
      contributions += c;
      monthsSincePeriodStart++;
      if (monthsSincePeriodStart === monthsPerPeriod) {
        balance *= 1 + periodRate;
        monthsSincePeriodStart = 0;
      }
      if (m % 12 === 0) {
        points.push({ year: m / 12, balance: Math.round(balance), contributions: Math.round(contributions) });
      }
    }
    const totalInterest = balance - contributions;
    return { balance, contributions, totalInterest, points };
  }, [principal, monthly, rate, years, frequency]);

  const { toggle: startingAmountToggle, field: startingAmountField, mode: startingAmountMode, selectedAccount: startingAmountAccount } = useAccountAmountField({
    value: principal, onChange: setPrincipal, accounts, balances,
  });

  useEffect(() => {
    if (startingAmountMode === "account" && startingAmountAccount && startingAmountAccount.interestRate != null) {
      setRate(startingAmountAccount.interestRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startingAmountMode, startingAmountAccount?.id, startingAmountAccount?.interestRate]);

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="card">
        <div className="card-title">
          <span><TrendingUp size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />Compound Interest Calculator</span>
          {startingAmountToggle}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Starting amount</label>
            {startingAmountField}
          </div>
          <div className="form-group">
            <label>Monthly contribution</label>
            <input className="input" type="number" min="0" step="10" value={monthly} onWheel={blurOnWheel} onChange={(e) => setMonthly(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Annual interest rate (%)</label>
            <input className="input" type="number" min="0" step="0.1" value={rate} onWheel={blurOnWheel} onChange={(e) => setRate(e.target.value)} />
            {startingAmountMode === "account" && startingAmountAccount?.interestRate != null && (
              <div className="tool-note">Pulled from {startingAmountAccount.name}'s saved rate - edit freely.</div>
            )}
          </div>
          <div className="form-group">
            <label>Years</label>
            <input className="input" type="number" min="1" step="1" value={years} onWheel={blurOnWheel} onChange={(e) => setYears(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Compounding frequency</label>
          <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {COMPOUND_FREQUENCIES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stat-row tool-result-row">
        <StatCard label="Future value" value={fmt(result.balance)} tone="brass" icon={TrendingUp} />
        <StatCard label="Total contributions" value={fmt(result.contributions)} tone="teal" icon={PiggyBank} />
        <StatCard label="Total interest earned" value={fmt(result.totalInterest)} tone="teal" icon={ArrowUpRight} />
      </div>

      <div className="card">
        <div className="card-title">Growth over time</div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={result.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="toolBalanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brass)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brass)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={70} />
              <Tooltip formatter={(v) => fmt(v)} labelFormatter={(y) => `Year ${y}`} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
              <Area type="monotone" dataKey="balance" stroke="var(--brass)" fill="url(#toolBalanceFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
