import React, { useMemo, useState } from "react";
import {
  Plus, ChevronLeft, ChevronRight, CheckCircle2, Circle, Undo2,
  CalendarClock, Target, Repeat, AlertCircle, CircleDollarSign, Wallet, Link2
} from "lucide-react";
import {
  addMonths, dayOfWeek, daysInMonth, firstOfMonth, generateBillOccurrences,
  addDays, FREQUENCY_LABELS, goalProgress, linkableTransactions, monthLabel, occurrenceStatus, sortedGoalsList,
} from "../../state/planning";
import { fmt, fmtDate } from "../../utils/format";
import { sumMoney, sumMoneyBy } from "../../utils/money";
import { todayStr } from "../../utils/dates";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CAL_DOTS = 4;   // dots per day (compact cells) before collapsing into "+N"
const MAX_CAL_CHIPS = 2;  // labeled chips per day (roomy cells) before collapsing into "+N more"
const GOAL_HORIZON_DAYS = 30; // "Upcoming Goals" includes dated goals due within this many days
const OVERDUE_WINDOW_DAYS = 30; // the Overdue stat only counts unpaid bills that came due within this many days
const CARRYOVER_DAYS = 7;     // on the current month, unpaid bills from the last N days of the previous month stay in the bills list

// Every bill occurrence due in [start, end], oldest first, with its status.
function billRowsForRange(bills, start, end, today) {
  const rows = [];
  (bills || []).forEach((bill) => {
    generateBillOccurrences(bill, start, end).forEach((o) => {
      rows.push({ bill, dateKey: o.dateKey, status: occurrenceStatus(bill, o.dateKey, today) });
    });
  });
  return rows.sort((x, y) => x.dateKey.localeCompare(y.dateKey) || (x.bill.name || "").localeCompare(y.bill.name || ""));
}

// Income bills are "received", not "paid". Display copy only - the internal
// "paid" status and the completions data are unchanged.
const doneWord = (bill) => (bill.type === "income" ? "received" : "paid");
const doneLabel = (bill) => (bill.type === "income" ? "Received" : "Paid");

const markerTone = (status) => (status === "overdue" ? "tone-rust" : status === "paid" ? "tone-teal" : "tone-brass");

export function PlanView({
  bills, goals, accounts, categories, transactions, balances,
  onAddBill, onEditBill,
  onAddGoal, onEditGoal, onAddContribution,
  onMarkPaid, onUnmarkPaid, onAssignTransaction, onLinkTransaction,
}) {
  const today = todayStr();
  const [monthCursor, setMonthCursor] = useState(firstOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [contribInputs, setContribInputs] = useState({}); // goalId -> string
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [linkOpenKey, setLinkOpenKey] = useState(null); // "billId:dateKey" of the bottom-list row whose link picker is open

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "Unknown account";
  const categoryName = (id) => (id ? (categories.find((c) => c.id === id)?.name || "Uncategorized") : "Uncategorized");

  const monthStart = monthCursor;
  const monthEnd = `${monthCursor.slice(0, 7)}-${String(daysInMonth(monthCursor)).padStart(2, "0")}`;

  // Every occurrence in the visible month, bucketed by day.
  const occurrencesByDay = useMemo(() => {
    const map = {};
    (bills || []).forEach((b) => {
      generateBillOccurrences(b, monthStart, monthEnd).forEach((o) => {
        (map[o.dateKey] = map[o.dateKey] || { bills: [], goals: [] }).bills.push(b);
      });
    });
    (goals || []).forEach((g) => {
      if (g.targetDate && g.targetDate >= monthStart && g.targetDate <= monthEnd) {
        (map[g.targetDate] = map[g.targetDate] || { bills: [], goals: [] }).goals.push(g);
      }
    });
    return map;
  }, [bills, goals, monthStart, monthEnd]);

  const leadingBlanks = dayOfWeek(monthStart);
  const totalDays = daysInMonth(monthStart);
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(`${monthCursor.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDayEntries = occurrencesByDay[selectedDay] || { bills: [], goals: [] };
  const selectedCount = selectedDayEntries.bills.length + selectedDayEntries.goals.length;

  // The bills list follows the month being browsed on the calendar. The goals
  // list is today-relative: goals due within the next GOAL_HORIZON_DAYS (or
  // "All"). The "Left to pay" stat stays on the current calendar month so it
  // doesn't change while browsing.
  const currentMonthStart = firstOfMonth(today);
  const currentMonthEnd = `${currentMonthStart.slice(0, 7)}-${String(daysInMonth(currentMonthStart)).padStart(2, "0")}`;
  const monthBillRows = useMemo(() => billRowsForRange(bills, monthStart, monthEnd, today), [bills, today, monthStart, monthEnd]);
  const currentMonthRows = useMemo(
    () => (monthStart === currentMonthStart ? monthBillRows : billRowsForRange(bills, currentMonthStart, currentMonthEnd, today)),
    [bills, today, monthStart, currentMonthStart, currentMonthEnd, monthBillRows]
  );
  // Unpaid bills from the last CARRYOVER_DAYS days that fall in the previous
  // month (e.g. on the 1st, a bill that was due on the 30th is still visible).
  const carryoverRows = useMemo(() => {
    const carryStart = addDays(today, -CARRYOVER_DAYS);
    if (carryStart >= currentMonthStart) return [];
    return billRowsForRange(bills, carryStart, addDays(currentMonthStart, -1), today).filter((r) => r.status === "overdue");
  }, [bills, today, currentMonthStart]);
  // Browsing the current month: carried-over overdue bills first, then the month.
  const listBillRows = monthStart === currentMonthStart ? [...carryoverRows, ...monthBillRows] : monthBillRows;
  const monthPaidCount = listBillRows.filter((r) => r.status === "paid").length;

  // "Upcoming" = dated goals due from today through the horizon (achieved ones
  // included, with their badge), plus unmet goals that are past their date or
  // have no date. Once an undated goal is achieved it moves out of Upcoming and
  // into "All". "All" adds the rest, except goals that are achieved and already
  // past their date. Both views are in date order (past due first, undated
  // last); in "All", unmet goals sort ahead of achieved ones.
  const { upcomingGoalRows, allGoalRows } = useMemo(() => {
    const horizon = addDays(today, GOAL_HORIZON_DAYS);
    const upcoming = [];
    const all = [];
    sortedGoalsList(goals).forEach((goal) => {
      const progress = goalProgress(goal, balances, today);
      const row = { goal, progress };
      const dated = !!goal.targetDate;
      const dueSoon = dated && goal.targetDate >= today && goal.targetDate <= horizon;
      if (dueSoon || (!progress.achieved && (!dated || goal.targetDate < today))) upcoming.push(row);
      if (!(progress.achieved && dated && goal.targetDate < today)) all.push(row);
    });
    const unmetFirst = [...all.filter((r) => !r.progress.achieved), ...all.filter((r) => r.progress.achieved)];
    return { upcomingGoalRows: upcoming, allGoalRows: unmetFirst };
  }, [goals, balances, today]);
  const goalRows = showAllGoals ? allGoalRows : upcomingGoalRows;

  // Unpaid expenses still due this month, including the carried-over overdue ones shown in the bills list.
  const leftToPay = useMemo(() => {
    const amounts = [];
    [...carryoverRows, ...currentMonthRows].forEach(({ bill, status }) => {
      if (bill.type !== "income" && status !== "paid") amounts.push(bill.amount || 0);
    });
    return { total: sumMoney(amounts), count: amounts.length };
  }, [carryoverRows, currentMonthRows]);

  const planSummary = useMemo(() => {
    // Both counts are per occurrence (a weekly bill with 4 unpaid weeks is 4).
    // "Overdue" only looks back OVERDUE_WINDOW_DAYS, so a bill whose first due
    // date is far in the past doesn't flood the count with ancient history.
    const yesterday = addDays(today, -1);
    const overdueFrom = addDays(today, -OVERDUE_WINDOW_DAYS);
    const horizon = addDays(today, 30);
    let overdueBills = 0;
    let upcomingBills = 0;
    (bills || []).forEach((bill) => {
      generateBillOccurrences(bill, overdueFrom, yesterday).forEach((o) => { if (occurrenceStatus(bill, o.dateKey, today) !== "paid") overdueBills += 1; });
      generateBillOccurrences(bill, today, horizon).forEach((o) => { if (occurrenceStatus(bill, o.dateKey, today) !== "paid") upcomingBills += 1; });
    });
    const totalGoalTarget = sumMoneyBy(goals || [], (goal) => goal.targetAmount || 0);
    const totalGoalSaved = sumMoneyBy(goals || [], (goal) => goalProgress(goal, balances, today).current);
    return { upcomingBills, overdueBills, totalGoalTarget, totalGoalSaved };
  }, [bills, goals, balances, today]);

  // Transactions on the bill's account, near the occurrence date, not already
  // linked to this or any other bill occurrence - candidates for "link an
  // existing transaction" instead of creating a new one.
  const linkCandidates = (bill, dateKey) => linkableTransactions(transactions, bills, bill, dateKey);

  // "Link transaction…" picker shared by the day panel and the bills list.
  const renderLinkSelect = (bill, dateKey, onDone) => (
    <select
      className="select plan-link-select"
      value=""
      aria-label={`Link a transaction to ${bill.name}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        if (v === "__new__") onAssignTransaction(bill, dateKey);
        else onLinkTransaction(bill.id, dateKey, v);
        if (onDone) onDone();
      }}
    >
      <option value="" disabled>Link transaction…</option>
      {linkCandidates(bill, dateKey).map((t) => (
        <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.description || "—"} · {fmt(t.amount)}</option>
      ))}
      <option value="__new__">+ Create a new transaction for this</option>
    </select>
  );

  const renderMonthBillRow = ({ bill, dateKey, status }) => {
    const paid = status === "paid";
    const doneText = doneWord(bill);
    const linkedTxId = bill.completions ? bill.completions[dateKey] : null;
    const linkedTx = typeof linkedTxId === "string" ? transactions.find((t) => t.id === linkedTxId) : null;
    const day = Number(dateKey.slice(8));
    const rowKey = `${bill.id}:${dateKey}`;
    const linkOpen = linkOpenKey === rowKey && !paid;
    const carried = dateKey.slice(0, 7) !== monthStart.slice(0, 7);
    const badgeSub = carried
      ? new Date(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: "short" })
      : WEEKDAY_LABELS[dayOfWeek(dateKey)];
    return (
      <div
        key={rowKey}
        className={`plan-row plan-row-${status}`}
        role="button"
        tabIndex={0}
        onClick={() => onEditBill(bill, dateKey)}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEditBill(bill, dateKey); } }}
      >
        <div className="plan-date-badge">
          <b>{day}</b>
          <span>{badgeSub}</span>
        </div>
        <div className="plan-row-main">
          <div className="plan-row-name">
            <span className="plan-row-title">{bill.name}</span>
            {bill.recurring && <span className="pill"><Repeat size={11} /> {FREQUENCY_LABELS[bill.frequency] || bill.frequency}</span>}
          </div>
          <div className="muted plan-row-sub">
            {accountName(bill.accountId)} · {categoryName(bill.categoryId)}{linkedTx ? " · linked" : ""}
          </div>
        </div>
        <div className="plan-row-side">
          <span className={`amount ${bill.type === "income" ? "tone-teal" : "tone-rust"}`}>{bill.type === "income" ? "+" : "−"}{fmt(linkedTx ? linkedTx.amount : bill.amount)}</span>
          <span className={`plan-row-status ${paid ? "tone-teal" : status === "overdue" ? "tone-rust" : "muted"}`}>
            {paid ? doneLabel(bill) : status === "overdue" ? "Overdue" : "Upcoming"}
          </span>
        </div>
        {paid ? (
          <button
            className="icon-btn plan-check"
            title={`Undo ${doneText}`}
            aria-label={`Undo ${doneText} for ${bill.name}`}
            onClick={(e) => { e.stopPropagation(); onUnmarkPaid(bill.id, dateKey); }}
          >
            <Undo2 size={17} />
          </button>
        ) : (
          <button
            className={`icon-btn plan-check ${linkOpen ? "tone-brass" : ""}`}
            title="Link a transaction"
            aria-label={`Link a transaction to ${bill.name}`}
            aria-expanded={linkOpen}
            onClick={(e) => { e.stopPropagation(); setLinkOpenKey(linkOpen ? null : rowKey); }}
          >
            <Link2 size={17} />
          </button>
        )}
        {paid ? (
          // Status check; clicking it also undoes, but the Undo button beside it is the accessible control.
          <button
            className="icon-btn plan-check tone-teal"
            title={`Undo ${doneText}`}
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => { e.stopPropagation(); onUnmarkPaid(bill.id, dateKey); }}
          >
            <CheckCircle2 size={18} />
          </button>
        ) : (
          <button
            className="icon-btn plan-check"
            title={`Mark ${doneText}`}
            aria-label={`Mark ${bill.name} ${doneText}`}
            onClick={(e) => { e.stopPropagation(); onMarkPaid(bill.id, dateKey); }}
          >
            <Circle size={18} />
          </button>
        )}
        {linkOpen && (
          <div className="plan-row-link" onClick={(e) => e.stopPropagation()}>
            {renderLinkSelect(bill, dateKey, () => setLinkOpenKey(null))}
          </div>
        )}
      </div>
    );
  };

  const renderGoalRow = ({ goal, progress }) => (
    <div key={goal.id} className={`plan-row plan-goal-row ${progress.achieved ? "plan-row-done" : ""}`} role="button" tabIndex={0} onClick={() => onEditGoal(goal)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEditGoal(goal); } }}>
      <div className="plan-goal-top">
        <span className="plan-row-title"><Target size={13} className={progress.achieved ? "tone-teal" : "tone-amber"} /> {goal.name}</span>
        <span className={`plan-goal-due ${progress.overdue ? "tone-rust" : "muted"}`}>
          {goal.targetDate
            ? (progress.overdue ? `Past due ${fmtDate(goal.targetDate)}` : progress.daysLeft === 0 ? "Due today" : `${progress.daysLeft} day${progress.daysLeft === 1 ? "" : "s"} left · ${fmtDate(goal.targetDate)}`)
            : "No target date"}
        </span>
      </div>
      <div className="dash-budget-bar-track">
        <div className="dash-budget-bar-fill" style={{ width: `${progress.pct}%`, background: progress.achieved ? "var(--teal)" : "var(--brass)" }} />
      </div>
      <div className="plan-goal-amounts muted">
        <span>{fmt(progress.current)} of {fmt(progress.target)}</span>
        <span className="plan-goal-pct" title={progress.achieved ? "Goal achieved" : undefined}>
          {progress.achieved && <CheckCircle2 size={13} />}
          {Math.round(progress.pct)}%
        </span>
      </div>
      {goal.trackingMode === "manual" && !progress.achieved && (
        <div className="plan-goal-contrib" onClick={(e) => e.stopPropagation()}>
          <input
            type="number" min="0" step="0.01" placeholder="Add amount saved"
            className="input mono" value={contribInputs[goal.id] || ""}
            onChange={(e) => setContribInputs((s) => ({ ...s, [goal.id]: e.target.value }))}
          />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const amt = parseFloat(contribInputs[goal.id]);
              if (amt > 0) onAddContribution(goal.id, amt);
              setContribInputs((s) => ({ ...s, [goal.id]: "" }));
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      )}
    </div>
  );

  const renderOccurrenceRow = (bill, dateKey) => {
    const status = occurrenceStatus(bill, dateKey, today);
    const key = `${bill.id}:${dateKey}`;
    const linkedTxId = bill.completions ? bill.completions[dateKey] : null;
    const linkedTx = typeof linkedTxId === "string" ? transactions.find((t) => t.id === linkedTxId) : null;

    return (
      <div
        key={key}
        className={`plan-occ-row ${status === "paid" ? "plan-occ-paid" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => { if (window.getSelection().toString()) return; onEditBill(bill, dateKey); }}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEditBill(bill, dateKey); } }}
      >
        <div className="plan-occ-main">
          <div className="plan-occ-name">
            {bill.name}
            {bill.recurring && <span className="pill"><Repeat size={11} /> {FREQUENCY_LABELS[bill.frequency] || bill.frequency}</span>}
            <span className={`pill ${status === "paid" ? "tone-teal" : status === "overdue" ? "tone-rust" : ""}`}>
              {status === "paid" ? <CheckCircle2 size={11} /> : status === "overdue" ? <AlertCircle size={11} /> : null}
              {status === "paid" ? doneLabel(bill) : status === "overdue" ? "Overdue" : "Upcoming"}
            </span>
          </div>
          <div className="muted plan-occ-sub">
            {accountName(bill.accountId)} · {categoryName(bill.categoryId)}
            {linkedTx && <> · linked to “{linkedTx.description || bill.name}”</>}
          </div>
        </div>
        <div className={`amount ${bill.type === "income" ? "tone-teal" : "tone-rust"}`}>
          {bill.type === "income" ? "+" : "−"}{fmt(linkedTx ? linkedTx.amount : bill.amount)}
        </div>
        <div className="row-actions">
          {status === "paid" ? (
            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onUnmarkPaid(bill.id, dateKey); }}><Undo2 size={13} /> Undo</button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onMarkPaid(bill.id, dateKey); }}><CheckCircle2 size={13} /> Mark {doneWord(bill)}</button>
              {renderLinkSelect(bill, dateKey)}
            </>
          )}
        </div>
      </div>
    );
  };

  const weeks = cells.length / 7;

  return (
    <div className="plan-view">
      <div className="plan-stats">
        <div className="plan-stat">
          <div className="plan-stat-icon tone-brass"><CalendarClock size={17} /></div>
          <div><div className="plan-stat-label" title="Unpaid bills coming due in the next 30 days">Due in 30 days</div><div className="plan-stat-value tone-brass">{planSummary.upcomingBills}</div></div>
        </div>
        <div className="plan-stat">
          <div className="plan-stat-icon tone-rust"><AlertCircle size={17} /></div>
          <div><div className="plan-stat-label" title="Unpaid bills that came due in the last 30 days">Overdue · 30 days</div><div className="plan-stat-value tone-rust">{planSummary.overdueBills}</div></div>
        </div>
        <div className="plan-stat">
          <div className="plan-stat-icon tone-brass"><Wallet size={17} /></div>
          <div>
            <div className="plan-stat-label" title="Unpaid expense bills still due this month, plus any overdue from the last week of last month">Left to pay</div>
            <div className={`plan-stat-value ${leftToPay.count === 0 ? "tone-teal" : "tone-brass"}`}>
              {leftToPay.count === 0 ? "All paid" : fmt(leftToPay.total)}
              {leftToPay.count > 0 && <span className="plan-stat-of"> · {leftToPay.count} bill{leftToPay.count === 1 ? "" : "s"}</span>}
            </div>
          </div>
        </div>
        <div className="plan-stat">
          <div className="plan-stat-icon tone-amber"><CircleDollarSign size={17} /></div>
          <div><div className="plan-stat-label">Saved toward goals</div><div className="plan-stat-value tone-amber" title={`${fmt(planSummary.totalGoalSaved)} / ${fmt(planSummary.totalGoalTarget)}`}>{fmt(planSummary.totalGoalSaved)} <span className="plan-stat-of">/ {fmt(planSummary.totalGoalTarget)}</span></div></div>
        </div>
      </div>

      <div className="plan-main">
        <div className="card plan-calendar-card">
          <div className="plan-cal-head">
            <button className="icon-btn" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <div className="plan-cal-title">{monthLabel(monthCursor)}</div>
            <button className="icon-btn" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMonthCursor(firstOfMonth(today)); setSelectedDay(today); }}>Today</button>
            <div className="plan-cal-actions">
              <button className="btn btn-ghost btn-sm" onClick={onAddGoal}><Plus size={14} /> Goal</button>
              <button className="btn btn-primary btn-sm" onClick={onAddBill}><Plus size={14} /> Bill</button>
            </div>
          </div>

          <div className="plan-cal-body">
            <div className="plan-cal-weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((w) => <div key={w} className="plan-cal-weekday"><span className="wd-full">{w}</span><span className="wd-short">{w[0]}</span></div>)}
            </div>
            <div className="plan-cal-grid" style={{ "--weeks": weeks }}>
              {cells.map((dateKey, i) => {
                if (!dateKey) return <div key={i} className="plan-cal-cell plan-cal-cell-blank" />;
                const entries = occurrencesByDay[dateKey];
                const isToday = dateKey === today;
                const isSelected = dateKey === selectedDay;
                // One combined pool of markers (bills + goal target dates), so the
                // "+N" overflow always trails everything actually shown.
                const markers = entries
                  ? [
                      ...entries.bills.map((b) => ({ kind: "bill", key: b.id, label: b.name, tone: markerTone(occurrenceStatus(b, dateKey, today)) })),
                      ...entries.goals.map((g) => ({ kind: "goal", key: g.id, label: g.name, tone: goalProgress(g, balances, today).achieved ? "tone-teal" : "tone-amber" })),
                    ]
                  : [];
                return (
                  <button
                    key={dateKey}
                    className={`plan-cal-cell ${isToday ? "plan-cal-cell-today" : ""} ${isSelected ? "plan-cal-cell-selected" : ""}`}
                    onClick={() => setSelectedDay(dateKey)}
                    aria-label={`${fmtDate(dateKey)}${entries?.bills.length ? `, ${entries.bills.length} bill${entries.bills.length === 1 ? "" : "s"} due` : ""}${entries?.goals.length ? `, goal target date` : ""}`}
                    aria-pressed={isSelected}
                  >
                    <span className="plan-cal-daynum">{Number(dateKey.slice(8))}</span>
                    {markers.length > 0 && (
                      <>
                        <span className="plan-cal-dots">
                          {markers.slice(0, MAX_CAL_DOTS).map((m) => (
                            m.kind === "bill"
                              ? <span key={`b-${m.key}`} className={`plan-cal-dot ${m.tone}`} />
                              : <Target key={`g-${m.key}`} size={10} className={m.tone} />
                          ))}
                          {markers.length > MAX_CAL_DOTS && <span className="plan-cal-more">+{markers.length - MAX_CAL_DOTS}</span>}
                        </span>
                        <span className="plan-cal-chips">
                          {markers.slice(0, MAX_CAL_CHIPS).map((m) => (
                            <span key={`${m.kind}-${m.key}`} className={`plan-cal-chip ${m.tone}`}>
                              {m.kind === "goal" && <Target size={9} />}
                              <span>{m.label}</span>
                            </span>
                          ))}
                          {markers.length > MAX_CAL_CHIPS && <span className="plan-cal-more">+{markers.length - MAX_CAL_CHIPS} more</span>}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="plan-cal-legend muted">
            <span><span className="plan-cal-dot tone-brass" /> Upcoming</span>
            <span><span className="plan-cal-dot tone-rust" /> Overdue</span>
            <span><span className="plan-cal-dot tone-teal" /> Done</span>
            <span><Target size={10} className="tone-amber" /> Goal date</span>
          </div>
        </div>

        <div className="card plan-day-panel">
          <div className="plan-day-head">
            <div className="plan-day-date">{fmtDate(selectedDay)}{selectedDay === today && <span className="pill">Today</span>}</div>
            <span className="plan-day-meta muted">{selectedCount} item{selectedCount === 1 ? "" : "s"}</span>
          </div>
          <div className="plan-day-body">
            <section>
              <h4 className="plan-day-section-title">Bills</h4>
              {selectedDayEntries.bills.length === 0 ? (
                <p className="settings-desc plan-day-empty">No bills on this day.</p>
              ) : (
                <div className="plan-occ-list">{selectedDayEntries.bills.map((b) => renderOccurrenceRow(b, selectedDay))}</div>
              )}
            </section>
            <section>
              <h4 className="plan-day-section-title">Goals</h4>
              {selectedDayEntries.goals.length === 0 ? (
                <p className="settings-desc plan-day-empty">No goal dates on this day.</p>
              ) : (
                <div className="plan-occ-list">
                  {selectedDayEntries.goals.map((g) => {
                    const goalDone = goalProgress(g, balances, today).achieved;
                    return (
                    <div
                      key={g.id}
                      className={`plan-occ-row plan-occ-goal ${goalDone ? "plan-occ-paid" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => { if (window.getSelection().toString()) return; onEditGoal(g); }}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEditGoal(g); } }}
                    >
                      <div className="plan-occ-main">
                        <div className="plan-occ-name"><Target size={13} className={goalDone ? "tone-teal" : "tone-amber"} /> {g.name} <span className="pill">Goal date</span>{goalDone && <span className="pill tone-teal"><CheckCircle2 size={11} /> Achieved</span>}</div>
                        <div className="muted plan-occ-sub">Target: {fmt(g.targetAmount)}</div>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <div className="plan-lists">
        <section className="card plan-list-card">
          <div className="plan-list-head">
            <h3 className="plan-list-title">Bills · {monthLabel(monthStart)}</h3>
            {listBillRows.length > 0 && <span className="muted plan-list-meta">{monthPaidCount} of {listBillRows.length} done</span>}
          </div>
          {listBillRows.length === 0 ? (
            <>
              <p className="settings-desc plan-list-empty">No bills due in {monthLabel(monthStart)}.</p>
              <div className="plan-list-empty-action">
                <button className="btn btn-ghost btn-sm" onClick={onAddBill}><Plus size={14} /> Add Bill</button>
              </div>
            </>
          ) : (
            <div className="plan-row-list">{listBillRows.map(renderMonthBillRow)}</div>
          )}
        </section>

        <section className="card plan-list-card">
          <div className="plan-list-head">
            <h3 className="plan-list-title">{showAllGoals ? "All Goals" : "Upcoming Goals"}</h3>
            <div className="seg card-corner-seg" role="group" aria-label="Goals shown">
              <button type="button" className={`seg-btn ${!showAllGoals ? "active" : ""}`} onClick={() => setShowAllGoals(false)}>Upcoming</button>
              <button type="button" className={`seg-btn ${showAllGoals ? "active" : ""}`} onClick={() => setShowAllGoals(true)}>All</button>
            </div>
          </div>
          {goalRows.length === 0 ? (
            <>
              <p className="settings-desc plan-list-empty">{(goals || []).length === 0 ? "No goals yet." : showAllGoals ? "No open goals." : "No upcoming goals."}</p>
              <div className="plan-list-empty-action">
                <button className="btn btn-ghost btn-sm" onClick={onAddGoal}><Plus size={14} /> Add Goal</button>
              </div>
            </>
          ) : (
            <div className="plan-row-list">{goalRows.map(renderGoalRow)}</div>
          )}
        </section>
      </div>
    </div>
  );
}
