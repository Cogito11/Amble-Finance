import React from "react";
import {
  Wallet, ArrowUpRight, ArrowDownRight, ArrowRightLeft, CreditCard, Sliders, ChevronRight
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from "recharts";
import { EmptyState } from "../common/EmptyState";
import { Gauge } from "../common/Gauge";
import { StatCard } from "../common/StatCard";
import { planTotalSpent } from "./BudgetsView";
import { ACCOUNT_ICONS, ACCOUNT_LABELS, DASHBOARD_WIDGETS, defaultWidgetPrefs } from "../../constants";
import { computeBalance, sortedAccountsList } from "../../state/accounts";
import { categorySpend, planAllocated } from "../../state/categories";
import { currentMonthKey, isWithinRolling30Days, monthKeyOf, toLocalDateStr, todayStr } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";
import { sortTransactionsNewestFirst } from "../../utils/misc";

/* ---------------------------------- dashboard ---------------------------------- */
export function Dashboard({ accounts, categories, transactions, balances, plans, onAdd, onGoTx, onNavigate, widgets, onCustomize }) {
  const w = widgets || defaultWidgetPrefs();
  const netWorth = accounts.reduce((s, a) => s + balances[a.id], 0);
  const totalAssets = accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + balances[a.id], 0);
  const totalDebt = accounts.filter((a) => a.type === "credit").reduce((s, a) => s + Math.max(0, -balances[a.id]), 0);

  const cmk = currentMonthKey();
  const monthTx = transactions.filter((t) => monthKeyOf(t.date) === cmk);
  const monthIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const activePlan = (plans || []).find((p) => p.active) || null;
  const activePlanId = activePlan?.id;
  // Only top-level categories here; itemized sub-expenses (e.g. "Netflix" under
  // "Subscriptions") roll their spend up into the parent instead of appearing separately.
  const expenseCats = categories.filter((c) => c.type === "expense" && !c.parentCategoryId);
  // Same rule as the Status tab: general categories + the active plan's categories only.
  const budgeted = expenseCats.filter((c) => c.limit > 0 && (!c.planId || c.planId === activePlanId));
  // Gauges track all-time spend for dated budgets, and a rolling 30 days for
  // everything else (undated budgets and general categories) — see categorySpend.
  const catSpend = budgeted.map((c) => ({
    ...c,
    spent: categorySpend(c, transactions, plans, categories),
  })).sort((a, b) => (b.spent / (b.limit || 1)) - (a.spent / (a.limit || 1))).slice(0, 4);

  // "Uncategorized" isn't tied to any budget, so — like any category with no time
  // frame — its gauge is scoped to a rolling 30 days rather than the calendar month.
  const rolling30Tx = transactions.filter((t) => t.type === "expense" && isWithinRolling30Days(t.date));
  const uncategorizedSpentRolling = rolling30Tx.filter((t) => !t.categoryId).reduce((s, t) => s + t.amount, 0);
  const rolling30Expense = rolling30Tx.reduce((s, t) => s + t.amount, 0);

  // Same rule as the budget gauges above: general categories + the active plan's
  // categories only, so a deactivated budget's spend doesn't linger in the pie. Each
  // slice's value follows categorySpend's time-frame rule too — all-time for a category
  // whose plan has a start/end date, rolling 30 days for everything else — so the pie
  // and the gauges always agree on what a given category's "spend" means.
  const pieData = expenseCats
    .filter((c) => !c.planId || c.planId === activePlanId)
    .map((c) => ({
      name: c.name, color: c.color,
      value: categorySpend(c, transactions, plans, categories),
    })).filter((d) => d.value > 0);

  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = toLocalDateStr(d).slice(0, 7);
    const label = d.toLocaleString("default", { month: "short" });
    const tx = transactions.filter((t) => monthKeyOf(t.date) === key);
    trendData.push({
      month: label,
      income: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    });
  }

  // Net worth over time, at exact granularity: one point for every date in the
  // last 6 months that actually has a transaction, instead of a single sampled
  // value per month. Each point is net worth as of the end of that date,
  // reconstructed by replaying every transaction dated on or before it — same
  // "replay through computeBalance" approach as before, just at the resolution
  // of individual transaction dates rather than month boundaries.
  const dateToTs = (isoDate) => new Date(`${isoDate}T00:00:00`).getTime();
  const today = todayStr();
  const nwTodayTs = dateToTs(today);

  // The 1st of each of the last 6 months. Used both as explicit x-axis tick
  // marks and as guaranteed "anchor" data points below, so every month has
  // something to hover even in months with zero transactions.
  const nwMonthStarts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    nwMonthStarts.push(toLocalDateStr(d));
  }
  const nwWindowStart = nwMonthStarts[0];
  const nwWindowStartTs = dateToTs(nwWindowStart);

  // Every date the chart needs a point for: the start of each month (so a
  // quiet month still shows its carried-forward value on hover, instead of
  // just a long gap the line has to interpolate across) plus every date that
  // actually has a transaction. Multiple transactions on the same day still
  // collapse into a single point.
  const txDatesInWindow = transactions.filter((t) => t.date >= nwWindowStart && t.date <= today).map((t) => t.date);
  const allDatesInWindow = Array.from(new Set([...nwMonthStarts, ...txDatesInWindow])).sort();

  const netWorthTrendData = allDatesInWindow.map((date) => {
    const txUpTo = transactions.filter((t) => t.date <= date);
    return { date, t: dateToTs(date), netWorth: accounts.reduce((s, a) => s + computeBalance(a, txUpTo), 0) };
  });
  // Always end on today's actual net worth, even on a day with no transactions,
  // so the line reflects the current balance rather than stopping early.
  if (netWorthTrendData[netWorthTrendData.length - 1].date !== today) {
    netWorthTrendData.push({ date: today, t: nwTodayTs, netWorth });
  }

  // Explicit x-axis ticks: the 1st of each of the last 6 months. Left to its
  // own auto-generation on a numeric time domain, Recharts (combined with
  // minTickGap) tended to collapse down to just the first/last tick, so the
  // month markers are pinned explicitly instead.
  const nwMonthTicks = nwMonthStarts.map(dateToTs);


  // By default a value axis starts at 0, which flattens a high net worth's small
  // month-to-month swings into an almost-straight line. Instead, raise the floor to
  // just under the lowest value in the series (with a little padding above/below so
  // the line never touches the edges), leaving the top essentially as-is.
  const nwValues = netWorthTrendData.map((d) => d.netWorth);
  const nwMin = Math.min(...nwValues);
  const nwMax = Math.max(...nwValues);
  const nwRange = nwMax - nwMin;
  const nwPadding = nwRange > 0 ? nwRange * 0.15 : Math.max(Math.abs(nwMax) * 0.05, 50);
  const nwFloor = nwMin - nwPadding;
  // Net worth is usually non-negative, so a padded floor that dips below 0 just
  // reads as a confusing negative axis label. Clamp it at 0 — unless net worth
  // itself actually went negative, in which case flooring at 0 would clip that
  // real data off the chart, so let the floor track it in that case.
  const nwDomain = [nwMin < 0 ? nwFloor : Math.max(0, nwFloor), nwMax + nwPadding];
  // Since nwDomain's bounds are arbitrary (not "round" numbers), letting the axis
  // auto-generate ticks can produce an uneven extra gridline wedged in near the
  // bottom. Pinning exactly 3 ticks — floor, midpoint, ceiling — keeps the grid to
  // a clean top/middle/bottom with nothing stray in between.
  const nwTicks = [nwDomain[0], (nwDomain[0] + nwDomain[1]) / 2, nwDomain[1]];

  const planBudgeted = activePlan ? planAllocated(activePlan) : 0;
  const planSpent = activePlan ? planTotalSpent(activePlan, transactions) : 0;
  const planRemaining = planBudgeted - planSpent;
  const planPct = planBudgeted > 0 ? planSpent / planBudgeted : 0;
  const planBarColor = planPct > 1 ? "var(--rust)" : planPct > 0.85 ? "var(--amber)" : "var(--teal)";

  const recent = sortTransactionsNewestFirst(transactions).slice(0, 6);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Uncategorized";
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  if (accounts.length === 0) {
    return <EmptyState icon={Wallet} title="Set up your first account" message="Add a checking, savings, or credit card account to start tracking your money." actionLabel="Add account" onAction={onGoTx} />;
  }

  const anyWidgetOn = DASHBOARD_WIDGETS.some((d) => w[d.id]);
  if (!anyWidgetOn) {
    return (
      <EmptyState
        icon={Sliders}
        title="Your dashboard is empty"
        message="Every widget is currently hidden. Turn some back on to see your finances at a glance."
        actionLabel="Customize dashboard"
        onAction={onCustomize}
      />
    );
  }

  const showPie = w.categoryPie;
  const showTrend = w.trend;

  return (
    <div className="dash">
      {w.stats && (
        <div className="stat-row">
          <StatCard label="Net worth" value={fmt(netWorth)} tone="brass" icon={Wallet} />
          <StatCard label="Total assets" value={fmt(totalAssets)} tone="teal" icon={ArrowUpRight} />
          <StatCard label="Total debt" value={fmt(totalDebt)} tone={totalDebt === 0 ? "teal" : "rust"} icon={CreditCard} />
          <StatCard label="This month, net" value={fmt(monthIncome - monthExpense)} tone={monthIncome - monthExpense >= 0 ? "teal" : "rust"} icon={monthIncome - monthExpense >= 0 ? ArrowUpRight : ArrowDownRight} />
        </div>
      )}

      {(w.accounts || w.budgetProgress) && (
        <div className={`grid-2${w.accounts && w.budgetProgress ? "" : " grid-2-single"}`}>
          {w.accounts && (
            <div className="card">
              <div className="card-title">
                Accounts
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.("accounts")}>View all <ChevronRight size={14} /></button>
              </div>
              <div className="dash-acc-list">
                {sortedAccountsList(accounts).slice(0, 3).map((a) => {
                  const Icon = ACCOUNT_ICONS[a.type];
                  const bal = balances[a.id];
                  const isDebt = a.type === "credit";
                  return (
                    <div key={a.id} className="dash-acc-row">
                      <div className="dash-acc-icon" style={{ color: `var(--${isDebt ? "rust" : a.type === "savings" ? "brass" : "teal"})` }}><Icon size={16} /></div>
                      <div className="dash-acc-info">
                        <div className="dash-acc-name">{a.name}</div>
                        <div className="dash-acc-type muted">{ACCOUNT_LABELS[a.type]}</div>
                      </div>
                      <div className={`dash-acc-balance ${isDebt || bal < 0 ? "tone-rust" : "tone-brass"}`}>
                        {isDebt ? fmt(Math.max(0, -bal)) : fmt(bal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {w.budgetProgress && (
            <div className="card">
              <div className="card-title">
                Active budget
                <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.("plans")}>View budgets <ChevronRight size={14} /></button>
              </div>
              {activePlan ? (
                <div className="dash-budget">
                  <div className="dash-budget-name">{activePlan.name}</div>
                  <div className="dash-budget-bar-track">
                    <div className="dash-budget-bar-fill" style={{ width: `${Math.min(planPct, 1) * 100}%`, background: planBarColor }} />
                    <div className="dash-budget-bar-ticks">
                      <span className="dash-budget-bar-tick" style={{ left: "25%" }} />
                      <span className="dash-budget-bar-tick" style={{ left: "50%" }} />
                      <span className="dash-budget-bar-tick" style={{ left: "75%" }} />
                    </div>
                  </div>
                  <div className="dash-budget-bar-scale">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                  <div className="plan-summary-bar">
                    <div>
                      <span className="muted">Budgeted</span>
                      <strong>{fmt(planBudgeted)}</strong>
                    </div>
                    <div>
                      <span className="muted">Spent</span>
                      <strong>{fmt(planSpent)}</strong>
                    </div>
                    <div>
                      <span className="muted">Remaining</span>
                      <strong className={planRemaining < 0 ? "tone-rust" : "tone-teal"}>{fmt(planRemaining)}</strong>
                    </div>
                    <div className="plan-summary-pct">
                      <span className="muted">% Spent</span>
                      <strong className={planPct > 1 ? "tone-rust" : planPct > 0.85 ? "tone-amber" : "tone-teal"}>{Math.round(planPct * 100)}%</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="chart-empty">No active budget. Set one as active in Budgets to track it here.</div>
              )}
            </div>
          )}
        </div>
      )}

      {w.budgetGauges && (budgeted.length > 0 || uncategorizedSpentRolling > 0) && (
        <div className="card">
          <div className="card-title">Budget progress</div>
          <div className="gauge-row">
            {catSpend.map((c) => <Gauge key={c.id} spent={c.spent} limit={c.limit} label={c.name} />)}
            {uncategorizedSpentRolling > 0 && (
              <Gauge
                spent={uncategorizedSpentRolling}
                limit={rolling30Expense}
                label="Uncategorized"
                footnote={`${Math.round((uncategorizedSpentRolling / rolling30Expense) * 100)}% of spending`}
              />
            )}
          </div>
        </div>
      )}

      {w.netWorthTrend && (
        <div className="card">
          <div className="card-title">Net worth, last 6 months</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={netWorthTrendData}>
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brass)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--brass)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[nwWindowStartTs, nwTodayTs]}
                ticks={nwMonthTicks}
                interval={0}
                stroke="var(--text-faint)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickFormatter={(ts) => new Date(ts).toLocaleString("default", { month: "short" })}
              />
              <YAxis
                domain={nwDomain}
                ticks={nwTicks}
                stroke="var(--text-faint)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v < 0 ? "-" : ""}$${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1).replace(/\.0$/, "") + "k" : Math.round(Math.abs(v))}`}
                width={48}
              />
              <Tooltip
                formatter={(v) => fmt(v)}
                labelFormatter={(ts) => new Date(ts).toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" })}
                contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
                itemStyle={{ color: "var(--text)" }}
                labelStyle={{ color: "var(--text)" }}
              />
              <Area type="stepAfter" dataKey="netWorth" stroke="var(--brass)" strokeWidth={2.5} fill="url(#netWorthFill)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {(showPie || showTrend) && (
        <div className={`grid-2${showPie && showTrend ? "" : " grid-2-single"}`}>
          {showPie && (
            <div className="card">
              <div className="card-title">Spending by category</div>
              {pieData.length === 0 ? (
                <div className="chart-empty">No expenses logged yet.</div>
              ) : (
                <div className="pie-wrap">
                  <div className="pie-chart-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={2}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} stroke="var(--surface)" strokeWidth={2} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pie-legend">
                    {[...pieData].sort((a, b) => b.value - a.value).map((d, i) => (
                      <div key={i} className="legend-row">
                        <span className="legend-dot" style={{ background: d.color }} />
                        <span className="legend-name">{d.name}</span>
                        <span className="legend-val">{fmt(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {showTrend && (
            <div className="card">
              <div className="card-title">Income vs. expenses, last 6 months</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000) + "k" : v}`} width={44} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} labelStyle={{ color: "var(--text)" }} cursor={{ fill: "var(--brass-soft)" }} />
                  <Bar dataKey="income" fill="var(--teal)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="expense" fill="var(--rust)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {w.recent && (
        <div className="card">
          <div className="card-title">Recent transactions</div>
          {recent.length === 0 ? (
            <div className="chart-empty">No transactions yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th className="col-right">Amount</th></tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtDate(t.date)}</td>
                    <td>{t.description || catName(t.categoryId)}</td>
                    <td>
                      {t.type === "transfer" ? (
                        <div className="pill-group">
                          <span className="pill"><ArrowRightLeft size={12} /> {accName(t.accountId)} → {accName(t.toAccountId)}</span>
                          {t.categoryId && (
                            <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="pill" style={{ borderColor: categories.find((c) => c.id === t.categoryId)?.color || "var(--border)" }}>{catName(t.categoryId)}</span>
                      )}
                    </td>
                    <td className="muted">{accName(t.accountId)}</td>
                    <td className={`amount ${t.type === "income" ? "tone-teal" : t.type === "expense" ? "tone-rust" : ""}`}>
                      {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}{fmt(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
