export function computeBalance(account, transactions) {
  let balance = account.startingBalance || 0;
  transactions.forEach((t) => {
    if (t.type === "income" && t.accountId === account.id) balance += t.amount;
    else if (t.type === "expense" && t.accountId === account.id) balance -= t.amount;
    else if (t.type === "transfer") {
      if (t.accountId === account.id) balance -= t.amount;
      if (t.toAccountId === account.id) balance += t.amount;
    }
  });
  return balance;
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

// Same single-order-field approach as sortedPlansList: lower `order` = higher
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
