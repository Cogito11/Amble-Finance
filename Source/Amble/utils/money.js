// Money helpers. Amounts are stored as plain JS numbers of dollars (e.g. 12.34),
// but adding those in floating point drifts (0.1 + 0.2 === 0.30000000000000004),
// which showed up as accounts that never quite hit $0.00, goals sitting at 99.99...%
// and "debt" of 1e-16. Every place that adds, subtracts or compares money should go
// through these helpers, which do the arithmetic in whole cents (exact integers) and
// only convert back to dollars at the end.

// Added before rounding so values that are really "half a cent" in decimal but sit a
// hair under in binary (1.005 * 100 === 100.49999999999999) round the way a person
// expects (1.01). Far smaller than any real cent value, so it never changes a clean amount.
const HALF_CENT_NUDGE = 1e-7;

// Dollars -> whole cents (an exact integer). Non-finite input (NaN, Infinity,
// undefined, "abc") counts as 0 rather than poisoning every total it touches.
export function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const cents = Math.round(Math.abs(n) * 100 + HALF_CENT_NUDGE);
  return (n < 0 ? -cents : cents) || 0; // `|| 0` turns -0 into 0
}

export const fromCents = (cents) => cents / 100;

// Snaps a dollar value to whole cents.
export const roundMoney = (value) => fromCents(toCents(value));

// Exact sum of dollar amounts (any iterable of numbers).
export function sumMoney(values) {
  let cents = 0;
  for (const v of values) cents += toCents(v);
  return fromCents(cents);
}

// Exact sum of `fn(item)` over a list - e.g. sumMoneyBy(transactions, (t) => t.amount).
export function sumMoneyBy(list, fn) {
  let cents = 0;
  for (const item of list) cents += toCents(fn(item));
  return fromCents(cents);
}

// Compares two dollar amounts at cent precision: negative if a < b, 0 if equal, positive if a > b.
export const compareMoney = (a, b) => toCents(a) - toCents(b);
export const moneyEquals = (a, b) => toCents(a) === toCents(b);
export const moneyAtLeast = (a, b) => toCents(a) >= toCents(b);

// Largest amount any money field accepts. Far beyond any real personal-finance figure, but
// small enough that cent arithmetic stays exact (cents are whole numbers well under 2^53)
// and a stray "1e999" can't become Infinity - which JSON would silently save as null.
export const MAX_MONEY = 1e12;

// Validates and parses text typed into an amount field. Returns { value, error }:
// `value` is dollars rounded to cents when valid (else null), and `error` is null or one of
// "empty" | "invalid" | "too_small" | "too_large". `min`/`max` are inclusive and are checked
// after rounding, so 0.004 (which becomes 0.00) fails a min of 0.01.
export function checkMoneyInput(text, { min = 0.01, max = MAX_MONEY } = {}) {
  const raw = text === null || text === undefined ? "" : String(text).trim();
  if (raw === "") return { value: null, error: "empty" };
  const n = Number(raw); // stricter than parseFloat: "12abc" is NaN, not 12
  if (Number.isNaN(n)) return { value: null, error: "invalid" };
  // Overflow ("1e999" parses to Infinity) is a number that's too big, not gibberish; the literal
  // word "Infinity" has no digits, so it stays "invalid".
  if (!Number.isFinite(n)) return { value: null, error: /\d/.test(raw) ? "too_large" : "invalid" };
  if (Math.abs(n) > 1e15) return { value: null, error: "too_large" };
  const value = roundMoney(n);
  if (value > max) return { value: null, error: "too_large" };
  if (value < min) return { value: null, error: value < -max ? "too_large" : "too_small" };
  return { value, error: null };
}

export const parseMoneyInput = (text, options) => checkMoneyInput(text, options).value;
