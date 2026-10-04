// Builds YYYY-MM-DD from a Date's *local* calendar fields. Deliberately avoids
// toISOString(), which converts to UTC first - in timezones behind UTC that
// flips to the next calendar day as soon as it's evening locally (and in
// timezones ahead of UTC can flip back a day), so any default/current-day
// logic built on it would be off by one for part of the day.
export const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const todayStr = () => toLocalDateStr(new Date());

// Tolerates a missing/blank date (returns "") instead of throwing, so one damaged record
// can't take down every screen that groups transactions by month.
export const monthKeyOf = (dateStr) => String(dateStr ?? "").slice(0, 7);

// True only for a real calendar date written as YYYY-MM-DD (what <input type="date">
// produces). Rejects blanks, impossible dates like 2026-02-30, and the 5+ digit years a date
// input will happily emit if someone keeps typing in the year box (e.g. "20256-01-01"),
// which would otherwise be saved and then break month grouping.
export function isValidDateStr(value, { minYear = 1900, maxYear = 2200 } = {}) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (y < minYear || y > maxYear || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate(); // day 0 of the next month = last day of month m
}

export const currentMonthKey = () => monthKeyOf(todayStr());

// Shifts a "YYYY-MM" key by `delta` months (negative moves backward). Used to
// walk to "last month", "6 months ago", etc. without pulling in a date library.
export function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// A trailing 30-day window (today and the 29 days before it), used to scope spend
// for budgets/categories that don't have a fixed time frame - so their gauges track
// a consistent rolling month instead of resetting on the 1st of the calendar month.
export function isWithinRolling30Days(dateStr) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffStr = toLocalDateStr(cutoff);
  return dateStr >= cutoffStr && dateStr <= todayStr();
}

export function currentMonthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) };
}

// Adds `monthsToAdd` calendar months to `dateStr`, targeting `anchorDay` as the
// day-of-month (falling back to dateStr's own day if no anchor is given) instead
// of plain Date#setMonth. setMonth overflows into the following month when the
// target month is too short (e.g. Jan 31 + 1 month becomes Mar 3, silently
// skipping February and permanently losing the "31" anchor on every cycle after
// that). Clamping to the target month's actual last day - while always re-aiming
// at the original anchor day rather than whatever day the previous, possibly
// already-clamped cycle landed on - is what keeps a budget that starts on the
// 29th/30th/31st repeating on that same day every month it exists, and only
// falling back to the last day of the month on the short months in between.
export function addMonthsClamped(dateStr, monthsToAdd, anchorDay) {
  const d = new Date(dateStr + "T00:00:00");
  const day = anchorDay || d.getDate();
  const targetMonthIndex = d.getMonth() + monthsToAdd;
  const targetYear = d.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const result = new Date(targetYear, normalizedMonth, Math.min(day, lastDayOfTargetMonth));
  return toLocalDateStr(result);
}
