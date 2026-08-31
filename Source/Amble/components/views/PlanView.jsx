import React, { useMemo, useState } from "react";
import {
  Plus, ChevronLeft, ChevronRight, Pencil, Trash2, CheckCircle2, Undo2, Link2, Receipt,
  CalendarClock, Target, Repeat, AlertCircle
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import {
  addMonths, dayOfWeek, daysInMonth, firstOfMonth, generateBillOccurrences,
  goalProgress, monthLabel, nextUnpaidOccurrence, occurrenceStatus, sortedBillsList, sortedGoalsList,
} from "../../state/planning";
import { fmt, fmtDate } from "../../utils/format";
import { todayStr } from "../../utils/dates";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlanView({
  bills, goals, accounts, categories, transactions, balances,
  onAddBill, onEditBill, onDeleteBill,
  onAddGoal, onEditGoal, onDeleteGoal,
  onMarkPaid, onUnmarkPaid, onAssignTransaction, onLinkTransaction,
}) {
  const today = todayStr();
  const [monthCursor, setMonthCursor] = useState(firstOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [linkingKey, setLinkingKey] = useState(null); // `${billId}:${dateKey}`

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
  const hasAnyPlan = (bills || []).length > 0 || (goals || []).length > 0;
  const sortedBills = useMemo(() => sortedBillsList(bills, today), [bills, today]);
  const sortedGoals = useMemo(() => sortedGoalsList(goals), [goals]);

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

  const renderOccurrenceRow = (bill, dateKey) => {
    const status = occurrenceStatus(bill, dateKey, today);
    const key = `${bill.id}:${dateKey}`;
    const linkedTxId = bill.completions ? bill.completions[dateKey] : null;
    const linkedTx = typeof linkedTxId === "string" ? transactions.find((t) => t.id === linkedTxId) : null;

    return (
      <div key={key} className="plan-occ-row">
        <div className="plan-occ-main">
          <div className="plan-occ-name">
            {bill.name}
            {bill.recurring && <span className="pill"><Repeat size={11} /> {bill.frequency}</span>}
            <span className={`pill ${status === "paid" ? "tone-teal" : status === "overdue" ? "tone-rust" : ""}`}>
              {status === "paid" ? <CheckCircle2 size={11} /> : status === "overdue" ? <AlertCircle size={11} /> : null}
              {status === "paid" ? "Paid" : status === "overdue" ? "Overdue" : "Upcoming"}
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
            <button className="btn btn-ghost btn-sm" onClick={() => onUnmarkPaid(bill.id, dateKey)}><Undo2 size={13} /> Undo</button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => onMarkPaid(bill.id, dateKey)}><CheckCircle2 size={13} /> Mark paid</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLinkingKey(linkingKey === key ? null : key)}><Link2 size={13} /> Link transaction</button>
            </>
          )}
          <button className="icon-btn" title="Edit bill" onClick={() => onEditBill(bill)}><Pencil size={13} /></button>
        </div>
        {linkingKey === key && (
          <div className="plan-link-panel">
            {linkCandidates(bill, dateKey).length > 0 ? (
              <div className="plan-link-list">
                {linkCandidates(bill, dateKey).map((t) => (
                  <button key={t.id} className="plan-link-item" onClick={() => { onLinkTransaction(bill.id, dateKey, t.id); setLinkingKey(null); }}>
                    <Receipt size={13} className="muted" />
                    <span>{t.description || "—"}</span>
                    <span className="muted">{fmtDate(t.date)}</span>
                    <span className="mono">{fmt(t.amount)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="settings-desc" style={{ margin: 0 }}>No unlinked transactions on this account match yet.</p>
            )}
            <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => { setLinkingKey(null); onAssignTransaction(bill, dateKey); }}>
              <Plus size={13} /> Create a new transaction for this
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!hasAnyPlan) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing planned yet"
        message="Add a bill to track (one-time or recurring) or set a savings goal, and they'll show up here on the calendar."
        actionLabel="Add bill"
        onAction={onAddBill}
      />
    );
  }

  return (
    <div className="plan-view">
      <div className="plan-header">
        <button className="btn btn-ghost" onClick={onAddGoal}><Plus size={16} /> New goal</button>
        <button className="btn btn-primary" onClick={onAddBill}><Plus size={16} /> New bill</button>
      </div>

      <div className="card plan-calendar-card">
        <div className="plan-calendar-nav">
          <button className="icon-btn" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <div className="plan-calendar-month">{monthLabel(monthCursor)}</div>
          <button className="icon-btn" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => { setMonthCursor(firstOfMonth(today)); setSelectedDay(today); }}>Today</button>
        </div>
        <div className="plan-cal-grid plan-cal-weekdays">
          {WEEKDAY_LABELS.map((w) => <div key={w} className="plan-cal-weekday">{w}</div>)}
        </div>
        <div className="plan-cal-grid">
          {cells.map((dateKey, i) => {
            if (!dateKey) return <div key={i} className="plan-cal-cell plan-cal-cell-blank" />;
            const entries = occurrencesByDay[dateKey];
            const isToday = dateKey === today;
            const isSelected = dateKey === selectedDay;
            const hasOverdue = entries?.bills.some((b) => occurrenceStatus(b, dateKey, today) === "overdue");
            const hasUnpaid = entries?.bills.some((b) => occurrenceStatus(b, dateKey, today) !== "paid");
            return (
              <button
                key={dateKey}
                className={`plan-cal-cell ${isToday ? "plan-cal-cell-today" : ""} ${isSelected ? "plan-cal-cell-selected" : ""}`}
                onClick={() => setSelectedDay(dateKey)}
              >
                <span className="plan-cal-daynum">{Number(dateKey.slice(8))}</span>
                {entries && (
                  <span className="plan-cal-dots">
                    {entries.bills.length > 0 && <span className={`plan-cal-dot ${hasOverdue ? "tone-rust" : hasUnpaid ? "tone-brass" : "tone-teal"}`} />}
                    {entries.goals.length > 0 && <Target size={10} className="tone-amber" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card plan-day-panel">
        <div className="plan-day-heading">{fmtDate(selectedDay)}{selectedDay === today && <span className="pill">Today</span>}</div>
        {selectedDayEntries.bills.length === 0 && selectedDayEntries.goals.length === 0 ? (
          <p className="settings-desc" style={{ margin: 0 }}>Nothing due this day.</p>
        ) : (
          <div className="plan-occ-list">
            {selectedDayEntries.bills.map((b) => renderOccurrenceRow(b, selectedDay))}
            {selectedDayEntries.goals.map((g) => (
              <div key={g.id} className="plan-occ-row">
                <div className="plan-occ-main">
                  <div className="plan-occ-name"><Target size={13} className="tone-amber" /> {g.name} <span className="pill">Goal target date</span></div>
                  <div className="muted plan-occ-sub">Target: {fmt(g.targetAmount)}</div>
                </div>
                <button className="icon-btn" title="Edit goal" onClick={() => onEditGoal(g)}><Pencil size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2 plan-columns">
        <div>
          <h3 className="plan-col-title">Bills</h3>
          {sortedBills.length === 0 ? (
            <p className="settings-desc">No bills yet.</p>
          ) : (
            <div className="plan-bill-list">
              {sortedBills.map((b) => {
                const next = nextUnpaidOccurrence(b, today);
                return (
                  <div key={b.id} className="plan-bill-card" role="button" tabIndex={0} onClick={() => onEditBill(b)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditBill(b); } }}>
                    <div className="plan-bill-top">
                      <div className="budget-card-name">
                        {b.name}
                        {b.recurring && <span className="pill"><Repeat size={11} /> {b.frequency}</span>}
                      </div>
                      <div className="row-actions">
                        <button className="icon-btn" title="Edit bill" onClick={(e) => { e.stopPropagation(); onEditBill(b); }}><Pencil size={14} /></button>
                        <button className="icon-btn" title="Delete bill" onClick={(e) => { e.stopPropagation(); onDeleteBill(b.id); }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="muted">{accountName(b.accountId)} · {categoryName(b.categoryId)}</div>
                    <div className="plan-bill-bottom">
                      <span className={`amount ${b.type === "income" ? "tone-teal" : "tone-rust"}`}>{b.type === "income" ? "+" : "−"}{fmt(b.amount)}</span>
                      <span className="muted">{next ? `Next due ${fmtDate(next.dateKey)}` : "Fully paid"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <h3 className="plan-col-title">Goals</h3>
          {sortedGoals.length === 0 ? (
            <p className="settings-desc">No goals yet.</p>
          ) : (
            <div className="plan-goal-list">
              {sortedGoals.map((g) => {
                const progress = goalProgress(g, balances, today);
                return (
                  <div key={g.id} className="plan-goal-card" role="button" tabIndex={0} onClick={() => onEditGoal(g)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditGoal(g); } }}>
                    <div className="plan-bill-top">
                      <div className="budget-card-name">
                        {g.name}
                        {progress.achieved && <span className="pill tone-teal"><CheckCircle2 size={11} /> Achieved</span>}
                      </div>
                      <div className="row-actions">
                        <button className="icon-btn" title="Edit goal" onClick={(e) => { e.stopPropagation(); onEditGoal(g); }}><Pencil size={14} /></button>
                        <button className="icon-btn" title="Delete goal" onClick={(e) => { e.stopPropagation(); onDeleteGoal(g.id); }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="dash-budget-bar-track">
                      <div className="dash-budget-bar-fill" style={{ width: `${progress.pct}%`, background: progress.achieved ? "var(--teal)" : "var(--brass)" }} />
                    </div>
                    <div className="plan-bill-bottom">
                      <span className="muted">{fmt(progress.current)} of {fmt(progress.target)}</span>
                      <span className={`muted ${progress.overdue ? "tone-rust" : ""}`}>
                        {g.targetDate ? (progress.overdue ? `Past due ${fmtDate(g.targetDate)}` : `By ${fmtDate(g.targetDate)}`) : "No target date"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
