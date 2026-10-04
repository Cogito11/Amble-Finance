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
