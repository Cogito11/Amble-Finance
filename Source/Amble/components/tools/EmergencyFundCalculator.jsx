import React, { useState, useEffect, useMemo } from "react";
import {
  Target, PiggyBank, Calculator, ArrowLeft, ShieldCheck
} from "lucide-react";
import { StatCard } from "../common/StatCard";
import { useAccountAmountField } from "../../hooks/useAccountAmountField";
import { currentMonthKey, monthKeyOf, shiftMonthKey } from "../../utils/dates";
import { fmt } from "../../utils/format";
import { blurOnWheel } from "../../utils/misc";

export function EmergencyFundCalculator({ onBack, accounts, balances, transactions }) {
  const [expenses, setExpenses] = useState(2500);
  const [current, setCurrent] = useState(4000);
  const [targetMonths, setTargetMonths] = useState(6);
  const [expenseMode, setExpenseMode] = useState("manual");

  // Completed-month expense totals, most recent first, excluding the current
  // (still in-progress) month so "previous months" means fully-elapsed ones.
  const expenseHistory = useMemo(() => {
    const byMonth = {};
    (transactions || []).filter((t) => t.type === "expense").forEach((t) => {
      const mk = monthKeyOf(t.date);
      byMonth[mk] = (byMonth[mk] || 0) + t.amount;
    });
    const thisMonth = currentMonthKey();
    const lastMonthKey = shiftMonthKey(thisMonth, -1);
    const priorMonthKeys = Object.keys(byMonth).filter((mk) => mk !== thisMonth).sort().reverse().slice(0, 6);
    const avgTotal = priorMonthKeys.reduce((s, mk) => s + byMonth[mk], 0);
    return {
      lastMonthAmount: byMonth[lastMonthKey] || 0,
      hasLastMonth: byMonth[lastMonthKey] !== undefined,
      averageAmount: priorMonthKeys.length ? avgTotal / priorMonthKeys.length : 0,
      monthsUsed: priorMonthKeys.length,
    };
  }, [transactions]);

  useEffect(() => {
    if (expenseMode === "last-month" && expenseHistory.hasLastMonth) {
      setExpenses(Math.round(expenseHistory.lastMonthAmount * 100) / 100);
    } else if (expenseMode === "average" && expenseHistory.monthsUsed > 0) {
      setExpenses(Math.round(expenseHistory.averageAmount * 100) / 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseMode, expenseHistory.lastMonthAmount, expenseHistory.averageAmount, expenseHistory.hasLastMonth, expenseHistory.monthsUsed]);

  const result = useMemo(() => {
    const exp = Math.max(0, Number(expenses) || 0);
    const cur = Math.max(0, Number(current) || 0);
    const target = Math.max(1, Number(targetMonths) || 6);
    const targetAmount = exp * target;
    const monthsCovered = exp > 0 ? cur / exp : 0;
    const pctToTarget = targetAmount > 0 ? cur / targetAmount : 0;
    const shortfall = Math.max(0, targetAmount - cur);
    return { targetAmount, monthsCovered, pctToTarget, shortfall };
  }, [expenses, current, targetMonths]);

  const barColor = result.pctToTarget >= 1 ? "var(--teal)" : result.pctToTarget > 0.5 ? "var(--amber)" : "var(--rust)";

  const { toggle: currentSavingsToggle, field: currentSavingsField } = useAccountAmountField({
    value: current, onChange: setCurrent, accounts, balances,
  });

  const hasExpenseHistory = expenseHistory.hasLastMonth || expenseHistory.monthsUsed > 0;

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><ShieldCheck size={18} /> Emergency Fund Calculator</div>

      <div className="card">
        <div className="card-title">
          <span>Essential monthly expenses</span>
          {hasExpenseHistory && (
            <div className="seg card-corner-seg" role="group" aria-label="Expense source">
              <button type="button" className={`seg-btn ${expenseMode === "manual" ? "active" : ""}`} onClick={() => setExpenseMode("manual")}>Manual</button>
              <button type="button" className={`seg-btn ${expenseMode === "last-month" ? "active" : ""}`} disabled={!expenseHistory.hasLastMonth} onClick={() => setExpenseMode("last-month")}>Last month</button>
              <button type="button" className={`seg-btn ${expenseMode === "average" ? "active" : ""}`} disabled={!expenseHistory.monthsUsed} onClick={() => setExpenseMode("average")}>Average</button>
            </div>
          )}
        </div>
        {expenseMode === "manual" || !hasExpenseHistory ? (
          <div className="form-group">
            <input className="input" type="number" min="0" step="50" value={expenses} onWheel={blurOnWheel} onChange={(e) => setExpenses(e.target.value)} />
          </div>
        ) : (
          <div className="form-group">
            <input className="input" type="number" value={expenses} readOnly />
            <div className="tool-note">
              {expenseMode === "last-month"
                ? `Based on ${fmt(expenseHistory.lastMonthAmount)} spent last month.`
                : `Average of ${fmt(expenseHistory.averageAmount)}/mo across the last ${expenseHistory.monthsUsed} completed ${expenseHistory.monthsUsed === 1 ? "month" : "months"}.`}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <span>Emergency savings</span>
          {currentSavingsToggle}
        </div>
        <div className="form-group">
          <label>Current emergency savings</label>
          {currentSavingsField}
        </div>
        <div className="form-group">
          <label>Target coverage</label>
          <select className="select" value={targetMonths} onChange={(e) => setTargetMonths(Number(e.target.value))}>
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={9}>9 months</option>
            <option value={12}>12 months</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Progress toward target</div>
        <div className="dash-budget-bar-track" style={{ height: 14 }}>
          <div className="dash-budget-bar-fill" style={{ width: `${Math.min(result.pctToTarget, 1) * 100}%`, background: barColor }} />
        </div>
        <div className="dash-budget-bar-scale">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="stat-row tool-result-row">
        <StatCard label="Months currently covered" value={result.monthsCovered.toFixed(1)} tone="brass" icon={ShieldCheck} />
        <StatCard label="Target fund size" value={fmt(result.targetAmount)} tone="teal" icon={Target} />
        <StatCard label="Remaining to save" value={fmt(result.shortfall)} tone={result.shortfall > 0 ? "rust" : "teal"} icon={PiggyBank} />
      </div>
    </div>
  );
}
