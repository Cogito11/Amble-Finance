import { isAssetAccount, isDebtAccount } from "./accounts";
import { monthKeyOf } from "../utils/dates";
import { sumMoney, sumMoneyBy } from "../utils/money";

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

// Income minus expenses for one "YYYY-MM" month (transfers don't count).
export function netForMonth(transactions, monthKey) {
  const inMonth = transactions.filter((t) => monthKeyOf(t.date) === monthKey);
  return sumMoney([sumAmountsOfType(inMonth, "income"), -sumAmountsOfType(inMonth, "expense")]);
}
