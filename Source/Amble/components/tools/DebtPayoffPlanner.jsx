import React, { useState, useMemo } from "react";
import {
  Plus, Trash2, ArrowUpRight, CreditCard, Download, ArrowLeft, TrendingDown, Percent
} from "lucide-react";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from "recharts";
import { EmptyState } from "../common/EmptyState";
import { StatCard } from "../common/StatCard";
import { fmt, fmtMonths } from "../../utils/format";
import { blurOnWheel, uid } from "../../utils/misc";

// Simulates paying off a set of debts under a given strategy ("avalanche" pays
// the highest-APR debt first, "snowball" pays the smallest balance first).
// The user's total monthly outlay (sum of all minimums + any extra) stays
// constant every month, so once a debt is cleared its freed-up minimum
// payment automatically rolls into whichever debt is next in priority order.
export function simulateDebtPayoff(debts, extra, strategy) {
  const working = debts.map((d) => ({
    id: d.id,
    name: d.name || "Debt",
    apr: Math.max(0, Number(d.apr) || 0),
    minPayment: Math.max(0, Number(d.minPayment) || 0),
  }));
  const balMap = {};
  debts.forEach((d) => { balMap[d.id] = Math.max(0, Number(d.balance) || 0); });

  const totalMonthlyPayment = working.reduce((s, d) => s + d.minPayment, 0) + Math.max(0, Number(extra) || 0);
  const orderIds = [...working]
    .sort((a, b) => (strategy === "avalanche" ? b.apr - a.apr : balMap[a.id] - balMap[b.id]))
    .map((d) => d.id);

  let totalInterest = 0;
  let months = 0;
  const startingTotal = working.reduce((s, d) => s + balMap[d.id], 0);
  const points = [{ month: 0, balance: startingTotal }];
  const payoffOrder = [];
  const MAX_MONTHS = 600; // 50-year safety cap in case payments can't cover interest

  while (working.some((d) => balMap[d.id] > 0.01) && months < MAX_MONTHS) {
    months++;
    working.forEach((d) => {
      if (balMap[d.id] > 0) {
        const interest = balMap[d.id] * (d.apr / 100 / 12);
        balMap[d.id] += interest;
        totalInterest += interest;
      }
    });
    let budget = totalMonthlyPayment;
    working.forEach((d) => {
      if (balMap[d.id] > 0 && budget > 0) {
        const pay = Math.min(d.minPayment, balMap[d.id], budget);
        balMap[d.id] -= pay;
        budget -= pay;
      }
    });
    for (const id of orderIds) {
      if (budget <= 0) break;
      if (balMap[id] > 0) {
        const pay = Math.min(balMap[id], budget);
        balMap[id] -= pay;
        budget -= pay;
      }
    }
    orderIds.forEach((id) => {
      if (balMap[id] <= 0.01 && !payoffOrder.find((p) => p.id === id)) {
        payoffOrder.push({ id, name: working.find((w) => w.id === id).name, month: months });
      }
    });
    points.push({ month: months, balance: Math.max(0, working.reduce((s, d) => s + balMap[d.id], 0)) });
  }

  return { months, totalInterest, points, payoffOrder, totalMonthlyPayment, maxedOut: months >= MAX_MONTHS };
}

export function DebtPayoffPlanner({ onBack, accounts, balances }) {
  const [debts, setDebts] = useState([
    { id: uid(), name: "", balance: "", apr: "", minPayment: "" },
  ]);
  const [extra, setExtra] = useState(100);

  const creditAccounts = useMemo(
    () => (accounts || []).filter((a) => a.type === "credit" && Number(balances?.[a.id]) < 0),
    [accounts, balances]
  );
  const loadedAccountIds = useMemo(() => new Set(debts.map((d) => d.accountId).filter(Boolean)), [debts]);
  const hasUnloadedAccounts = creditAccounts.some((a) => !loadedAccountIds.has(a.id));

  const loadFromAccounts = () => {
    const newRows = creditAccounts
      .filter((a) => !loadedAccountIds.has(a.id))
      .map((a) => {
        const bal = Math.round(Math.abs(balances[a.id]) * 100) / 100;
        return { id: uid(), accountId: a.id, name: a.name, balance: bal, apr: a.interestRate != null ? a.interestRate : 20, minPayment: Math.max(25, Math.round(bal * 0.02)) };
      });
    setDebts((prev) => {
      const isBlankPlaceholder = prev.length === 1 && !prev[0].name && !prev[0].accountId && !Number(prev[0].balance);
      return [...(isBlankPlaceholder ? [] : prev), ...newRows];
    });
  };

  const updateDebt = (id, patch) => setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeDebt = (id) => setDebts((prev) => prev.filter((d) => d.id !== id));
  const addDebt = () => setDebts((prev) => [...prev, { id: uid(), name: "", balance: "", apr: "", minPayment: "" }]);

  const validDebts = useMemo(() => debts.filter((d) => Number(d.balance) > 0), [debts]);

  const snowball = useMemo(() => (validDebts.length ? simulateDebtPayoff(validDebts, extra, "snowball") : null), [validDebts, extra]);
  const avalanche = useMemo(() => (validDebts.length ? simulateDebtPayoff(validDebts, extra, "avalanche") : null), [validDebts, extra]);

  const combinedPoints = useMemo(() => {
    if (!snowball || !avalanche) return [];
    const len = Math.max(snowball.points.length, avalanche.points.length);
    const step = len > 121 ? Math.ceil(len / 121) : 1; // downsample long payoffs so the chart stays readable
    const arr = [];
    for (let m = 0; m < len; m += step) {
      arr.push({
        month: m,
        snowball: snowball.points[m] ? snowball.points[m].balance : 0,
        avalanche: avalanche.points[m] ? avalanche.points[m].balance : 0,
      });
    }
    return arr;
  }, [snowball, avalanche]);

  const interestSaved = snowball && avalanche ? snowball.totalInterest - avalanche.totalInterest : 0;
  const monthsSaved = snowball && avalanche ? snowball.months - avalanche.months : 0;

  return (
    <div className="tool-detail">
      <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All tools
      </button>

      <div className="tool-page-title"><CreditCard size={18} /> Debt Payoff Planner</div>

      <div className="card">
        <div className="card-title">How these strategies work</div>
        <div className="tool-strategy-explainer">
          <div>
            <div className="tool-strategy-name"><TrendingDown size={14} /> Snowball</div>
            <p>Pay minimums on everything, then throw every extra dollar at your <strong>smallest balance</strong> first. Once it's gone, roll that payment into the next-smallest. It ignores interest rates in favor of quick wins, so debts disappear fast and often keeps you motivated to stick with the plan.</p>
          </div>
          <div>
            <div className="tool-strategy-name"><Percent size={14} /> Avalanche</div>
            <p>Pay minimums on everything, then throw every extra dollar at your <strong>highest-interest-rate</strong> debt first. Once it's gone, move to the next-highest rate. This is the mathematically optimal order - it minimizes the total interest you pay over time.</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>Your debts</span>
          {hasUnloadedAccounts && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadFromAccounts}>
              <Download size={13} /> Load credit card balances
            </button>
          )}
        </div>
        <div className="debt-row-header">
          <span>Name</span>
          <span>Balance</span>
          <span>APR %</span>
          <span>Min payment</span>
          <span />
        </div>
        {debts.map((d) => (
          <div key={d.id} className="debt-row">
            <input className="input" placeholder="e.g. Visa card" value={d.name} onChange={(e) => updateDebt(d.id, { name: e.target.value })} />
            <input className="input mono" type="number" min="0" step="10" placeholder="0.00" value={d.balance} onWheel={blurOnWheel} onChange={(e) => updateDebt(d.id, { balance: e.target.value })} />
            <input className="input mono" type="number" min="0" step="0.1" placeholder="0" value={d.apr} onWheel={blurOnWheel} onChange={(e) => updateDebt(d.id, { apr: e.target.value })} />
            <input className="input mono" type="number" min="0" step="5" placeholder="0" value={d.minPayment} onWheel={blurOnWheel} onChange={(e) => updateDebt(d.id, { minPayment: e.target.value })} />
            <button type="button" className="icon-btn" title="Remove debt" onClick={() => removeDebt(d.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={addDebt}><Plus size={13} /> Add debt</button>
      </div>

      <div className="card">
        <div className="card-title">Extra monthly payment</div>
        <div className="form-group">
          <input className="input" type="number" min="0" step="10" value={extra} onWheel={blurOnWheel} onChange={(e) => setExtra(e.target.value)} />
          <div className="tool-note">Amount you can put toward debt beyond the minimum payments above, split between strategies below.</div>
        </div>
      </div>

      {!validDebts.length ? (
        <EmptyState icon={CreditCard} title="Add a debt to get started" message="Enter at least one debt with a balance above to compare payoff strategies." />
      ) : (
        <>
          <div className="card">
            <div className="card-title">Snowball vs. avalanche</div>
            <div className="stat-row tool-result-row" style={{ marginBottom: 12 }}>
              <StatCard label="Snowball: debt-free in" value={fmtMonths(snowball.months)} tone="brass" icon={TrendingDown} />
              <StatCard label="Snowball: total interest" value={fmt(snowball.totalInterest)} tone="rust" icon={ArrowUpRight} />
            </div>
            <div className="stat-row tool-result-row">
              <StatCard label="Avalanche: debt-free in" value={fmtMonths(avalanche.months)} tone="teal" icon={TrendingDown} />
              <StatCard label="Avalanche: total interest" value={fmt(avalanche.totalInterest)} tone="teal" icon={ArrowUpRight} />
            </div>
            <div className="tool-note" style={{ marginTop: 10 }}>
              {interestSaved > 1
                ? `Avalanche saves you ${fmt(interestSaved)} in interest compared to snowball`
                : interestSaved < -1
                ? `Snowball costs ${fmt(-interestSaved)} more in interest than avalanche`
                : "Both strategies cost about the same in interest for these debts"}
              {monthsSaved > 0
                ? `, and finishes ${monthsSaved} ${monthsSaved === 1 ? "month" : "months"} sooner`
                : monthsSaved < 0
                ? `, though it takes ${Math.abs(monthsSaved)} ${Math.abs(monthsSaved) === 1 ? "month" : "months"} longer`
                : ", and both finish in the same amount of time"}
              .
            </div>
          </div>

          <div className="card">
            <div className="card-title">Remaining balance over time</div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={combinedPoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={(m) => `Mo ${m}`} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={70} />
                  <Tooltip formatter={(v) => fmt(v)} labelFormatter={(m) => `Month ${m}`} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="snowball" name="Snowball" stroke="var(--brass)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avalanche" name="Avalanche" stroke="var(--teal)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="form-row">
            <div className="card">
              <div className="card-title">Snowball payoff order</div>
              {snowball.payoffOrder.map((p, i) => (
                <div key={p.id} className="debt-payoff-order-row">
                  <span>{i + 1}. {p.name}</span>
                  <span className="muted">{fmtMonths(p.month)}</span>
                </div>
              ))}
              {snowball.maxedOut && <div className="tool-note">Payments don't fully cover interest on some debts - increase the extra payment or minimums.</div>}
            </div>
            <div className="card">
              <div className="card-title">Avalanche payoff order</div>
              {avalanche.payoffOrder.map((p, i) => (
                <div key={p.id} className="debt-payoff-order-row">
                  <span>{i + 1}. {p.name}</span>
                  <span className="muted">{fmtMonths(p.month)}</span>
                </div>
              ))}
              {avalanche.maxedOut && <div className="tool-note">Payments don't fully cover interest on some debts - increase the extra payment or minimums.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
