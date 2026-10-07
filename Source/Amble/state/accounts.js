import { fromCents, toCents } from "../utils/money";

export function isDebtAccount(account) {
  return account.type === "credit" || account.type === "loan";
}

export function isAssetAccount(account) {
  return !isDebtAccount(account);
}

// An account still eligible to be picked - for new transactions, or as a
// source in the financial tools' "from account" pickers. A closed account
// keeps its balance and history but drops out of these selections; see
// AccountModal / ClosedAccountsModal for how accounts get closed and reopened.
export function isOpenAccount(account) {
  return !account.closed;
}

// Accumulates in whole cents (see utils/money.js) so the result is exact: a card paid
// off to the cent comes out as exactly 0, never 5.5e-17.
export function computeBalance(account, transactions) {
  let cents = toCents(account.startingBalance);
  transactions.forEach((t) => {
    if (t.type === "income" && t.accountId === account.id) cents += toCents(t.amount);
    else if (t.type === "expense" && t.accountId === account.id) cents -= toCents(t.amount);
    else if (t.type === "transfer") {
      if (t.accountId === account.id) cents -= toCents(t.amount);
      if (t.toAccountId === account.id) cents += toCents(t.amount);
    }
  });
  return fromCents(cents);
}

/* ---------------------------------- accounts view ---------------------------------- */
// One-time upgrade path for accounts saved before the `order` field existed.
// Accounts have no dateCreated to fall back on, so legacy ones just keep their
// existing array position as their order. Once every account has an explicit
// order this is a no-op.
export function migrateAccountOrder(accounts) {
  if (accounts.every((a) => typeof a.order === "number")) return accounts;
  return accounts.map((a, i) => (typeof a.order === "number" ? a : { ...a, order: i }));
}

// Same single-order-field approach as sortedBudgetsList: lower `order` = higher
// up the list, and that's the only thing that decides position.
export function sortedAccountsList(accounts) {
  return [...accounts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// An order value guaranteed to sort above every account currently in the list -
// used whenever a new account is created so it lands at the top.
export function nextTopAccountOrder(accounts) {
  if (!accounts.length) return 0;
  return Math.min(...accounts.map((a) => (typeof a.order === "number" ? a.order : 0))) - 1;
}
