import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetDueDate, budgetEndAnchorDay, budgetStartAnchorDay, defaultState, formRepeatAnchors, nextBudgetDates, rolloverDueBudgets } from "../Amble/state/budgets";

const monthly = (startDate, endDate, repeat = {}) => ({ startDate, endDate, repeat: { enabled: true, frequency: "monthly", ...repeat } });

// Walks nextBudgetDates cycle by cycle, carrying the repeat anchors forward exactly
// like rolloverDueBudgets does, and returns "MM-DD→MM-DD" for each cycle.
function cycles(budget, count) {
  const out = [];
  let cur = { ...budget, repeat: { ...budget.repeat, anchorDay: budgetStartAnchorDay(budget), endAnchorDay: budgetEndAnchorDay(budget) } };
  for (let i = 0; i < count; i++) {
    out.push(`${cur.startDate.slice(5)}→${cur.endDate.slice(5)}`);
    const next = nextBudgetDates(cur);
    cur = { ...cur, startDate: next.startDate, endDate: next.endDate };
  }
  return out;
}

describe("monthly repeat keeps its calendar shape (finding #6)", () => {
  it("a calendar-month budget stays a calendar month, in every month length", () => {
    // Oct 1-31: used to give Nov 1-Dec 1 (a day of overlap) and Feb 1-Mar 3.
    expect(cycles(monthly("2026-10-01", "2026-10-31"), 8)).toEqual([
      "10-01→10-31", "11-01→11-30", "12-01→12-31", "01-01→01-31", "02-01→02-28", "03-01→03-31", "04-01→04-30", "05-01→05-31",
    ]);
  });

  it("starting from a 30-day month still ends on the last day of 31-day months", () => {
    // Sep 1-30: used to give Oct 1-30, losing Oct 31.
    expect(cycles(monthly("2026-09-01", "2026-09-30"), 6)).toEqual([
      "09-01→09-30", "10-01→10-31", "11-01→11-30", "12-01→12-31", "01-01→01-31", "02-01→02-28",
    ]);
  });

  it("February in a leap year ends on the 29th", () => {
    expect(cycles(monthly("2027-12-01", "2027-12-31"), 4)).toEqual(["12-01→12-31", "01-01→01-31", "02-01→02-29", "03-01→03-31"]);
  });

  it("a mid-month budget that ends on the last day (the '15th paycheck' case)", () => {
    // Used to give Nov 15-Dec 1, overlapping the next '1st paycheck' budget.
    expect(cycles(monthly("2026-10-15", "2026-10-31"), 5)).toEqual(["10-15→10-31", "11-15→11-30", "12-15→12-31", "01-15→01-31", "02-15→02-28"]);
  });

  it("a fixed-day budget keeps the same days every month", () => {
    expect(cycles(monthly("2026-10-01", "2026-10-14"), 4)).toEqual(["10-01→10-14", "11-01→11-14", "12-01→12-14", "01-01→01-14"]);
  });

  it("a budget spanning two calendar months keeps spanning two months", () => {
    expect(cycles(monthly("2026-10-15", "2026-11-14"), 4)).toEqual(["10-15→11-14", "11-15→12-14", "12-15→01-14", "01-15→02-14"]);
  });

  it("a budget that explicitly ends on the 30th keeps ending on the 30th (clamped in February)", () => {
    expect(cycles(monthly("2026-10-01", "2026-10-30"), 5)).toEqual(["10-01→10-30", "11-01→11-30", "12-01→12-30", "01-01→01-30", "02-01→02-28"]);
  });

  it("a budget starting on the 31st keeps its anchors through short months", () => {
    // end is the last day of Feb, so it follows the end of each month; start is anchored to 31.
    expect(cycles(monthly("2027-01-31", "2027-02-28"), 5)).toEqual(["01-31→02-28", "02-28→03-31", "03-31→04-30", "04-30→05-31", "05-31→06-30"]);
  });

  it("uses stored anchors when present, so a clamped cycle doesn't lose the original day", () => {
    // This Feb cycle ends on the 28th, but the stored anchor says the budget really ends on the 30th.
    const next = nextBudgetDates(monthly("2027-02-01", "2027-02-28", { anchorDay: 1, endAnchorDay: 30 }));
    expect(next).toEqual({ startDate: "2027-03-01", endDate: "2027-03-30" });
  });

  it("the next cycle never ends before it starts", () => {
    const next = nextBudgetDates(monthly("2026-10-20", "2026-10-05", { anchorDay: 20, endAnchorDay: 5 }));
    expect(next.endDate >= next.startDate).toBe(true);
  });

  it("consecutive calendar-month cycles never overlap and never leave a gap (3 years)", () => {
    let cur = monthly("2026-01-01", "2026-01-31");
    for (let i = 0; i < 36; i++) {
      const next = nextBudgetDates(cur);
      const dayAfterEnd = new Date(cur.endDate + "T00:00:00");
      dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
      const expectedStart = `${dayAfterEnd.getFullYear()}-${String(dayAfterEnd.getMonth() + 1).padStart(2, "0")}-${String(dayAfterEnd.getDate()).padStart(2, "0")}`;
      expect(next.startDate).toBe(expectedStart);
      cur = { ...cur, startDate: next.startDate, endDate: next.endDate };
    }
  });
});

describe("other frequencies are unchanged (fixed length by design)", () => {
  it("weekly: due a week after start, same length", () => {
    const b = { startDate: "2026-10-01", endDate: "2026-10-07", repeat: { enabled: true, frequency: "weekly" } };
    expect(budgetDueDate(b)).toBe("2026-10-08");
    expect(nextBudgetDates(b)).toEqual({ startDate: "2026-10-08", endDate: "2026-10-14" });
  });
  it("biweekly", () => {
    const b = { startDate: "2026-10-01", endDate: "2026-10-14", repeat: { enabled: true, frequency: "biweekly" } };
    expect(nextBudgetDates(b)).toEqual({ startDate: "2026-10-15", endDate: "2026-10-28" });
  });
  it("match: chains off the end date, no gap, same length", () => {
    const b = { startDate: "2026-10-01", endDate: "2026-10-14", repeat: { enabled: true, frequency: "match" } };
    expect(budgetDueDate(b)).toBe("2026-10-14");
    expect(nextBudgetDates(b)).toEqual({ startDate: "2026-10-15", endDate: "2026-10-28" });
  });
  it("returns null without both dates", () => {
    expect(nextBudgetDates({ startDate: "2026-10-01", endDate: null, repeat: { enabled: true, frequency: "monthly" } })).toBeNull();
  });
});

/* ------------------------------ rolloverDueBudgets (end to end) ------------------------------ */
const makeBudget = (id, name, startDate, endDate, active, order, repeat = { enabled: true, frequency: "monthly" }) => ({
  ...defaultState().plans[0], id, name, startDate, endDate, active, order, categories: [], income: 0, incomeItems: [], repeat,
});
const stateWith = (plans) => ({ ...defaultState(), plans, categories: [], transactions: [], bills: [] });
const activeRange = (s) => s.plans.filter((b) => b.active).map((b) => `${b.startDate}→${b.endDate}`);
const at = (iso) => vi.setSystemTime(new Date(iso + "T12:00:00"));

describe("rolloverDueBudgets with monthly budgets", () => {
  afterEach(() => vi.useRealTimers());

  it("rolls a calendar-month budget forward month by month with correct dates", () => {
    vi.useFakeTimers();
    let s = stateWith([makeBudget("m", "Default Budget", "2026-10-01", "2026-10-31", true, 0)]);
    const seen = [];
    for (const day of ["2026-11-02", "2026-12-02", "2027-01-02", "2027-02-02", "2027-03-02"]) {
      at(day);
      s = rolloverDueBudgets(s);
      seen.push(...activeRange(s));
    }
    expect(seen).toEqual(["2026-11-01→2026-11-30", "2026-12-01→2026-12-31", "2027-01-01→2027-01-31", "2027-02-01→2027-02-28", "2027-03-01→2027-03-31"]);
  });

  it("repeated budgets carry the anchors forward, so a 30th-ending budget isn't permanently pulled to the 28th by February", () => {
    vi.useFakeTimers();
    let s = stateWith([makeBudget("m", "B", "2026-12-01", "2026-12-30", true, 0)]);
    const seen = [];
    for (const day of ["2027-01-02", "2027-02-02", "2027-03-02"]) {
      at(day);
      s = rolloverDueBudgets(s);
      seen.push(...activeRange(s));
    }
    expect(seen).toEqual(["2027-01-01→2027-01-30", "2027-02-01→2027-02-28", "2027-03-01→2027-03-30"]);
  });

  it("alternating 1st / 15th budgets hand over correctly and never overlap", () => {
    vi.useFakeTimers();
    let s = stateWith([
      makeBudget("A", "1st Paycheck", "2026-10-01", "2026-10-14", false, 1),
      makeBudget("B", "15th Paycheck", "2026-10-15", "2026-10-31", true, 0),
    ]);
    const log = [];
    let prev = "";
    for (let d = new Date("2026-10-20T12:00:00"); d <= new Date("2027-01-20T12:00:00"); d.setDate(d.getDate() + 1)) {
      vi.setSystemTime(new Date(d));
      s = rolloverDueBudgets(s);
      const now = `${s.plans.find((b) => b.active).name.replace(" Repeated", "")} ${activeRange(s)[0]}`;
      if (now !== prev) { log.push(now); prev = now; }
    }
    expect(log).toEqual([
      "15th Paycheck 2026-10-15→2026-10-31",
      "1st Paycheck 2026-11-01→2026-11-14",
      "15th Paycheck 2026-11-15→2026-11-30",
      "1st Paycheck 2026-12-01→2026-12-14",
      "15th Paycheck 2026-12-15→2026-12-31",
      "1st Paycheck 2027-01-01→2027-01-14",
      "15th Paycheck 2027-01-15→2027-01-31",
    ]);
  });

  it("only one budget is active after a rollover", () => {
    vi.useFakeTimers();
    at("2026-11-20");
    const s = rolloverDueBudgets(stateWith([
      makeBudget("A", "1st", "2026-10-01", "2026-10-14", false, 1),
      makeBudget("B", "15th", "2026-10-15", "2026-10-31", true, 0),
    ]));
    expect(s.plans.filter((b) => b.active)).toHaveLength(1);
  });

  it("does nothing when nothing is due", () => {
    vi.useFakeTimers();
    at("2026-10-20");
    const s = stateWith([makeBudget("m", "B", "2026-10-01", "2026-10-31", true, 0)]);
    expect(rolloverDueBudgets(s)).toBe(s);
  });
});

describe("formRepeatAnchors (what the budget form saves)", () => {
  it("a new budget derives both anchors from the typed dates", () => {
    expect(formRepeatAnchors({}, "2026-10-01", "2026-10-31")).toEqual({ anchorDay: 1, endAnchorDay: 31 });
    expect(formRepeatAnchors({}, "2026-10-15", "2026-11-14")).toEqual({ anchorDay: 15, endAnchorDay: 14 });
  });

  it("keeps stored anchors while the dates are untouched (a clamped Feb cycle remembers its 30th)", () => {
    const initial = { startDate: "2027-02-01", endDate: "2027-02-28", repeat: { anchorDay: 1, endAnchorDay: 30 } };
    expect(formRepeatAnchors(initial, "2027-02-01", "2027-02-28")).toEqual({ anchorDay: 1, endAnchorDay: 30 });
  });

  it("re-derives the start anchor when the start date is edited (stale anchor bug)", () => {
    const initial = { startDate: "2026-10-01", endDate: "2026-10-31", repeat: { anchorDay: 1, endAnchorDay: 31 } };
    // moved the start from the 1st to the 15th: next cycle must start on the 15th, not the 1st
    const anchors = formRepeatAnchors(initial, "2026-10-15", "2026-10-31");
    expect(anchors.anchorDay).toBe(15);
    expect(nextBudgetDates({ startDate: "2026-10-15", endDate: "2026-10-31", repeat: { frequency: "monthly", ...anchors } }).startDate).toBe("2026-11-15");
  });

  it("re-derives only the end anchor when only the end date is edited", () => {
    const initial = { startDate: "2026-10-01", endDate: "2026-10-31", repeat: { anchorDay: 1, endAnchorDay: 31 } };
    expect(formRepeatAnchors(initial, "2026-10-01", "2026-10-14")).toEqual({ anchorDay: 1, endAnchorDay: 14 });
  });

  it("returns null anchors for dates that are cleared", () => {
    expect(formRepeatAnchors({}, "", "")).toEqual({ anchorDay: null, endAnchorDay: null });
  });
});
