import React, { useState, useEffect, useMemo } from "react";
import {
  Target, ArrowUpRight, PiggyBank, Calculator, ArrowLeft
} from "lucide-react";
import { StatCard } from "../common/StatCard";
import { COMPOUND_FREQUENCIES } from "../../constants";
import { useAccountAmountField } from "../../hooks/useAccountAmountField";
import { fmt } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

export function SavingsGoalCalculator({ onBack, accounts, balances }) {
  const [goal, setGoal] = useState(20000);
  const [current, setCurrent] = useState(2000);
  const [rate, setRate] = useState(6);
  const [years, setYears] = useState(5);
  const [frequency, setFrequency] = useState("annually");

  const result = useMemo(() => {
    const g = Math.max(0, Number(goal) || 0);
    const cur = Math.max(0, Number(current) || 0);
    const annualRate = (Number(rate) || 0) / 100;
    const n = Math.max(1, Math.round((Number(years) || 0) * 12));
    const freq = COMPOUND_FREQUENCIES.find((f) => f.id === frequency) || COMPOUND_FREQUENCIES[0];
    const monthsPerPeriod = freq.monthsPerPeriod;
    const periodRate = annualRate * (monthsPerPeriod / 12);
    // Converted to a monthly-equivalent rate so every compounding frequency stays
    // consistent with the others - see the matching comment in
    // CompoundInterestCalculator.jsx for the full explanation of why this is
    // necessary (in short: applying a whole period's interest to that same
    // period's contributions in one lump sum overstates growth, worse for
    // coarser frequencies, which backwards-ranks annual above monthly).
    const monthlyRate = Math.pow(1 + periodRate, 1 / monthsPerPeriod) - 1;

    // Binary-search the monthly contribution that lands the balance on the
    // goal by the target date, using the same simulation as the growth
    // calculator above (keeps both tools consistent with each other).
    const simulate = (monthlyContribution) => {
      let balance = cur;
      for (let m = 1; m <= n; m++) {
        balance *= 1 + monthlyRate;
        balance += monthlyContribution;
      }
      return balance;
    };

    let lo = 0;
    let hi = Math.max(g, 1000);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (simulate(mid) < g) lo = mid; else hi = mid;
    }
    const requiredMonthly = simulate(0) >= g ? 0 : hi;
    const finalBalance = simulate(requiredMonthly);
    const totalContributions = cur + requiredMonthly * n;
    const totalInterest = finalBalance - totalContributions;

    return { requiredMonthly, finalBalance, totalContributions, totalInterest };
  }, [goal, current, rate, years, frequency]);

  const { toggle: currentSavingsToggle, field: currentSavingsField, mode: currentSavingsMode, selectedAccount: currentSavingsAccount } = useAccountAmountField({
    value: current, onChange: setCurrent, accounts, balances,
  });

  useEffect(() => {
    if (currentSavingsMode === "account" && currentSavingsAccount && currentSavingsAccount.interestRate != null) {
      setRate(currentSavingsAccount.interestRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSavingsMode, currentSavingsAccount?.id, currentSavingsAccount?.interestRate]);

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="card">
        <div className="card-title">
          <span><Target size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />Savings Goal Calculator</span>
          {currentSavingsToggle}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Goal amount</label>
            <input className="input" type="number" min="0" step="100" value={goal} onWheel={blurOnWheel} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Current savings</label>
            {currentSavingsField}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Annual interest rate (%)</label>
            <input className="input" type="number" min="0" step="0.1" value={rate} onWheel={blurOnWheel} onChange={(e) => setRate(e.target.value)} />
            {currentSavingsMode === "account" && currentSavingsAccount?.interestRate != null && (
              <div className="tool-note">Pulled from {currentSavingsAccount.name}'s saved rate - edit freely.</div>
            )}
          </div>
          <div className="form-group">
            <label>Years to reach goal</label>
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

      <div className="card tool-highlight-card">
        <div className="tool-highlight-label">Required monthly contribution</div>
        <div className="tool-highlight-value">{fmt(result.requiredMonthly)}</div>
        <div className="tool-note">to reach {fmt(goal)} in {years} {Number(years) === 1 ? "year" : "years"}</div>
      </div>

      <div className="stat-row tool-result-row">
        <StatCard label="Projected balance" value={fmt(result.finalBalance)} tone="brass" icon={Target} />
        <StatCard label="Total contributions" value={fmt(result.totalContributions)} tone="teal" icon={PiggyBank} />
        <StatCard label="Total interest earned" value={fmt(result.totalInterest)} tone="teal" icon={ArrowUpRight} />
      </div>
    </div>
  );
}
