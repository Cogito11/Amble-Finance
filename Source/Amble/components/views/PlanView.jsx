import React, { useMemo, useState } from "react";
import {
  Plus, ChevronLeft, ChevronRight, CheckCircle2, Circle, Undo2,
  CalendarClock, Target, Repeat, AlertCircle, CircleDollarSign, Wallet
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import {
  addMonths, dayOfWeek, daysInMonth, firstOfMonth, generateBillOccurrences,
  addDays, goalProgress, latestUnpaidOccurrence, monthLabel, nextUnpaidOccurrence, occurrenceStatus, sortedGoalsList,
} from "../../state/planning";
import { fmt, fmtDate } from "../../utils/format";
import { todayStr } from "../../utils/dates";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CAL_DOTS = 4;   // dots per day (compact cells) before collapsing into "+N"
const MAX_CAL_CHIPS = 2;  // labeled chips per day (roomy cells) before collapsing into "+N more"
const GOAL_HORIZON_DAYS = 30; // bottom list only shows goals due within this many days

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
  const hasAnyPlan = (bills || []).length > 0 || (goals || []).length > 0;

  // Bottom lists are deliberately narrow: bills due in the *current* calendar
  // month (not the month being browsed) and goals due within the
  // next GOAL_HORIZON_DAYS. Everything else stays reachable from the calendar.
  const currentMonthStart = firstOfMonth(today);
  const currentMonthEnd = `${currentMonthStart.slice(0, 7)}-${String(daysInMonth(currentMonthStart)).padStart(2, "0")}`;
  const monthBillRows = useMemo(() => {
    const rows = [];
    (bills || []).forEach((bill) => {
      generateBillOccurrences(bill, currentMonthStart, currentMonthEnd).forEach((o) => {
        rows.push({ bill, dateKey: o.dateKey, status: occurrenceStatus(bill, o.dateKey, today) });
      });
    });
    return rows.sort((x, y) => x.dateKey.localeCompare(y.dateKey) || (x.bill.name || "").localeCompare(y.bill.name || ""));
  }, [bills, today, currentMonthStart, currentMonthEnd]);
  const monthPaidCount = monthBillRows.filter((r) => r.status === "paid").length;

  // "Next 30 days" = goals dated from today through the horizon (achieved ones
  // included, with their badge). "All" = every goal except ones that are
  // achieved and already past their date; undated achieved goals stay so they
  // can still be opened and edited. Unmet goals sort ahead of achieved ones.
  const { upcomingGoalRows, allGoalRows } = useMemo(() => {
    const horizon = addDays(today, GOAL_HORIZON_DAYS);
    const upcoming = [];
    const all = [];
    sortedGoalsList(goals).forEach((goal) => {
      const progress = goalProgress(goal, balances, today);
      const row = { goal, progress };
      if (goal.targetDate && goal.targetDate >= today && goal.targetDate <= horizon) upcoming.push(row);
      if (!(progress.achieved && goal.targetDate && goal.targetDate < today)) all.push(row);
    });
    const unmetFirst = [...all.filter((r) => !r.progress.achieved), ...all.filter((r) => r.progress.achieved)];
    return { upcomingGoalRows: upcoming, allGoalRows: unmetFirst };
  }, [goals, balances, today]);
  const goalRows = showAllGoals ? allGoalRows : upcomingGoalRows;
  const canToggleGoals = allGoalRows.length > upcomingGoalRows.length;

  // Unpaid (not yet paid) expenses still due this calendar month.
  const leftToPay = useMemo(() => {
    let total = 0;
    let count = 0;
    monthBillRows.forEach(({ bill, status }) => {
      if (bill.type !== "income" && status !== "paid") { total += bill.amount || 0; count += 1; }
    });
    return { total, count };
  }, [monthBillRows]);

  const planSummary = useMemo(() => {
    const horizon = addDays(today, 30);
    const yesterday = addDays(today, -1);
    let upcomingBills = 0;
    let overdueBills = 0;
    (bills || []).forEach((bill) => {
      if (latestUnpaidOccurrence(bill, yesterday)) { overdueBills += 1; return; }
      const next = nextUnpaidOccurrence(bill, today);
      if (next && next.dateKey <= horizon) upcomingBills += 1;
    });
    const totalGoalTarget = (goals || []).reduce((sum, goal) => sum + (goal.targetAmount || 0), 0);
    const totalGoalSaved = (goals || []).reduce((sum, goal) => sum + goalProgress(goal, balances, today).current, 0);
    return { upcomingBills, overdueBills, totalGoalTarget, totalGoalSaved };
  }, [bills, goals, balances, today]);

  // Transactions on the bill's account, near the occurrence date, not already
  // linked to this or any other bill occurrence - candidates for "link an
  // existing transaction" instead of creating a new one.
  const linkCandidates = (bill, dateKey) => {
    const linkedTxIds = new Set();
    (bills || []).forEach((b) => Object.values(b.completions || {}).forEach((v) => { if (typeof v === "string") linkedTxIds.add(v); }));
    return transactions
      .filter((t) => t.accountId === bill.accountId && t.type === bill.type && !linkedTxIds.has(t.id))
      .map((t) => ({ t, gap: Math.abs(new Date(t.date) - new Date(dateKey)) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 6)
      .map((x) => x.t);
  };

  const renderMonthBillRow = ({ bill, dateKey, status }) => {
    const paid = status === "paid";
    const doneText = doneWord(bill);
    const linkedTxId = bill.completions ? bill.completions[dateKey] : null;
    const linkedTx = typeof linkedTxId === "string" ? transactions.find((t) => t.id === linkedTxId) : null;
    const day = Number(dateKey.slice(8));
    return (
      <div
        key={`${bill.id}:${dateKey}`}
        className={`plan-row plan-row-${status}`}
        role="button"
        tabIndex={0}
        onClick={() => onEditBill(bill)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditBill(bill); } }}
      >
        <div className="plan-date-badge">
          <b>{day}</b>
          <span>{WEEKDAY_LABELS[dayOfWeek(dateKey)]}</span>
        </div>
        <div className="plan-row-main">
          <div className="plan-row-name">
            <span className="plan-row-title">{bill.name}</span>
            {bill.recurring && <span className="pill"><Repeat size={11} /> {bill.frequency}</span>}
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
        <button
          className={`icon-btn plan-check ${paid ? "tone-teal" : ""}`}
          title={paid ? `Undo ${doneText}` : `Mark ${doneText}`}
          aria-label={paid ? `Undo ${doneText} for ${bill.name}` : `Mark ${bill.name} ${doneText}`}
          onClick={(e) => { e.stopPropagation(); if (paid) onUnmarkPaid(bill.id, dateKey); else onMarkPaid(bill.id, dateKey); }}
        >
          {paid ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
      </div>
    );
  };

  const renderGoalRow = ({ goal, progress }) => (
    <div key={goal.id} className={`plan-row plan-goal-row ${progress.achieved ? "plan-row-done" : ""}`} role="button" tabIndex={0} onClick={() => onEditGoal(goal)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditGoal(goal); } }}>
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
    const candidates = status !== "paid" ? linkCandidates(bill, dateKey) : [];

    return (
      <div
        key={key}
        className={`plan-occ-row ${status === "paid" ? "plan-occ-paid" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => { if (window.getSelection().toString()) return; onEditBill(bill); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditBill(bill); } }}
      >
        <div className="plan-occ-main">
          <div className="plan-occ-name">
            {bill.name}
            {bill.recurring && <span className="pill"><Repeat size={11} /> {bill.frequency}</span>}
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
              <select
                className="select plan-link-select"
                value=""
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "__new__") onAssignTransaction(bill, dateKey);
                  else onLinkTransaction(bill.id, dateKey, v);
                }}
              >
                <option value="" disabled>Link transaction…</option>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.description || "—"} · {fmt(t.amount)}</option>
                ))}
                <option value="__new__">+ Create a new transaction for this</option>
              </select>
            </>
          )}
        </div>
      </div>
    );
  };

  if (!hasAnyPlan) {
    return (
      <div className="plan-empty-wrap">
        <EmptyState
          icon={CalendarClock}
          title="Nothing planned yet"
          message="Add a bill to track (one-time or recurring) or set a savings goal, and they'll show up here on the calendar."
          actionLabel="Add bill"
          onAction={onAddBill}
        />
        <button className="btn btn-ghost btn-sm plan-empty-alt" onClick={onAddGoal}><Plus size={14} /> Or add a goal instead</button>
      </div>
    );
  }

  const weeks = cells.length / 7;

  return (
    <div className="plan-view">
      <div className="plan-stats">
        <div className="plan-stat">
          <div className="plan-stat-icon tone-brass"><CalendarClock size={17} /></div>
          <div><div className="plan-stat-label">Due in 30 days</div><div className="plan-stat-value tone-brass">{planSummary.upcomingBills}</div></div>
        </div>
        <div className="plan-stat">
          <div className="plan-stat-icon tone-rust"><AlertCircle size={17} /></div>
          <div><div className="plan-stat-label">Overdue</div><div className="plan-stat-value tone-rust">{planSummary.overdueBills}</div></div>
        </div>
        <div className="plan-stat">
          <div className="plan-stat-icon tone-brass"><Wallet size={17} /></div>
          <div>
            <div className="plan-stat-label" title="Unpaid expense bills still due this month">Left to pay</div>
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
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditGoal(g); } }}
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
            <h3 className="plan-list-title">Bills · {monthLabel(currentMonthStart)}</h3>
            {monthBillRows.length > 0 && <span className="muted plan-list-meta">{monthPaidCount} of {monthBillRows.length} done</span>}
          </div>
          {monthBillRows.length === 0 ? (
            <p className="settings-desc plan-list-empty">No bills due this month.</p>
          ) : (
            <div className="plan-row-list">{monthBillRows.map(renderMonthBillRow)}</div>
          )}
        </section>

        <section className="card plan-list-card">
          <div className="plan-list-head">
            <h3 className="plan-list-title">Goals · {showAllGoals ? "all" : `next ${GOAL_HORIZON_DAYS} days`}</h3>
            {(canToggleGoals || showAllGoals) ? (
              <div className="seg card-corner-seg" role="group" aria-label="Goals shown">
                <button type="button" className={`seg-btn ${!showAllGoals ? "active" : ""}`} onClick={() => setShowAllGoals(false)}>Next {GOAL_HORIZON_DAYS} days</button>
                <button type="button" className={`seg-btn ${showAllGoals ? "active" : ""}`} onClick={() => setShowAllGoals(true)}>All</button>
              </div>
            ) : (
              upcomingGoalRows.length > 0 && <span className="muted plan-list-meta">{upcomingGoalRows.length} due</span>
            )}
          </div>
          {goalRows.length === 0 ? (
            <p className="settings-desc plan-list-empty">{showAllGoals ? "No open goals." : `No goals due in the next ${GOAL_HORIZON_DAYS} days.`}</p>
          ) : (
            <div className="plan-row-list">{goalRows.map(renderGoalRow)}</div>
          )}
        </section>
      </div>
    </div>
  );
}
