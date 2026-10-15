import { isAssetAccount, isDebtAccount } from "./accounts";
import { monthKeyOf } from "../utils/dates";
import { fromCents, sumMoney, sumMoneyBy, toCents } from "../utils/money";

// Aggregates shared by the footer metric (App) and the Dashboard, which used to
// each re-implement them with raw floating point sums. Everything here adds in
// whole cents (see utils/money.js) so a card paid off to the cent is exactly 0,
// not 1e-16, and two views can never disagree by a rounding crumb.

const CASH_TYPES = ["checking", "savings", "cash"];

export function accountTotals(accounts, balances) {
  const bal = (a) => balances[a.id] || 0;
  return {
    netWorth: sumMoneyBy(accounts, bal),
    totalAssets: sumMoneyBy(accounts.filter(isAssetAccount), bal),
    totalDebt: sumMoneyBy(accounts.filter(isDebtAccount), (a) => Math.max(0, -bal(a))),
    cash: sumMoneyBy(accounts.filter((a) => CASH_TYPES.includes(a.type)), bal),
  };
}

// Sum of `amount` over a list of transactions.
export const sumAmounts = (transactions) => sumMoneyBy(transactions, (t) => t.amount);

export const sumAmountsOfType = (transactions, type) => sumAmounts(transactions.filter((t) => t.type === type));

// Net worth as of the end of each date in `dates` ("YYYY-MM-DD" strings, in any order): the sum of every
// account's balance counting only the transactions dated on or before that date. The result has one
// number per date, in the same order as `dates`.
//
// This gives exactly the same numbers as replaying the transactions through computeBalance once per
// date, but does it in a single pass over the transactions (sorted once) instead of one full replay per
// date per account, so it stays fast with years of history. Like computeBalance it works in whole cents,
// and it mirrors its rules: income and expense hit the transaction's account, a transfer takes from its
// account and adds to its toAccountId, and a transaction naming an account that isn't in `accounts`
// is ignored. A transaction with a blank date ("") counts as earlier than every date, as it does when
// compared as text; one whose date isn't text at all is never counted.
export function netWorthAtDates(accounts, transactions, dates) {
  const cents = accounts.map((a) => toCents(a.startingBalance));
  // Account id -> position(s) in `accounts`. Normally one; if a damaged file repeats an id, every
  // account carrying it receives the transaction, exactly as computeBalance would give each of them.
  const slots = new Map();
  accounts.forEach((a, i) => {
    const list = slots.get(a.id);
    if (list) list.push(i);
    else slots.set(a.id, [i]);
  });
  const add = (accountId, delta) => {
    const list = slots.get(accountId);
    if (list) for (const i of list) cents[i] += delta;
  };

  const byDate = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = transactions.filter((t) => typeof t.date === "string").sort((a, b) => byDate(a.date, b.date));
  const order = dates.map((_, i) => i).sort((x, y) => byDate(dates[x], dates[y]));

  const result = new Array(dates.length);
  let next = 0;
  for (const k of order) {
    const date = dates[k];
    for (; next < sorted.length && sorted[next].date <= date; next++) {
      const t = sorted[next];
      const amount = toCents(t.amount);
      if (t.type === "income") add(t.accountId, amount);
      else if (t.type === "expense") add(t.accountId, -amount);
      else if (t.type === "transfer") {
        add(t.accountId, -amount);
        add(t.toAccountId, amount);
      }
    }
    let total = 0;
    for (const c of cents) total += c;
    result[k] = fromCents(total);
  }
  return result;
}

// Income minus expenses for one "YYYY-MM" month (transfers don't count).
export function netForMonth(transactions, monthKey) {
  const inMonth = transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  return sumMoney([sumAmountsOfType(inMonth, "income"), -sumAmountsOfType(inMonth, "expense")]);
}
