import { describe, expect, it } from "vitest";
import { computeBalance } from "../Amble/state/accounts";
import { netWorthAtDates } from "../Amble/state/totals";
import { sumMoneyBy } from "../Amble/utils/money";

// The Dashboard's net-worth chart used to work out each point by replaying every transaction dated on or
// before it through computeBalance, once per account. netWorthAtDates does the same job in one pass. This
// file pins the two together: the replay below is that original method, and the single pass must give
// exactly the same numbers, including on damaged or odd data.
function netWorthByReplay(accounts, transactions, dates) {
  return dates.map((date) => {
    const txUpTo = transactions.filter((t) => t.date <= date);
    return sumMoneyBy(accounts, (a) => computeBalance(a, txUpTo));
  });
}

const acct = (id, startingBalance = 0) => ({ id, type: "checking", startingBalance });
const income = (accountId, amount, date) => ({ type: "income", accountId, amount, date });
const expense = (accountId, amount, date) => ({ type: "expense", accountId, amount, date });
const transfer = (accountId, toAccountId, amount, date) => ({ type: "transfer", accountId, toAccountId, amount, date });

describe("netWorthAtDates", () => {
  it("gives the net worth at the end of each date (hand-checked example)", () => {
    const accounts = [acct("c", 1000), acct("s", 200)];
    const tx = [
      income("c", 500, "2026-01-05"),
      expense("c", 200, "2026-01-10"),
      transfer("c", "s", 300, "2026-01-10"),
    ];
    // 01-01: 1000 + 200. 01-05: income lands. 01-10: expense leaves, the transfer only moves money between accounts.
    expect(netWorthAtDates(accounts, tx, ["2026-01-01", "2026-01-05", "2026-01-10", "2026-01-31"])).toEqual([1200, 1700, 1500, 1500]);
  });

  it("counts a transaction on the date itself (end of day, inclusive)", () => {
    expect(netWorthAtDates([acct("c", 0)], [income("c", 10, "2026-03-03")], ["2026-03-02", "2026-03-03"])).toEqual([0, 10]);
  });

  it("a transfer between two of the accounts leaves net worth unchanged; one to an unknown account does not", () => {
    const accounts = [acct("a", 100), acct("b", 100)];
    expect(netWorthAtDates(accounts, [transfer("a", "b", 40, "2026-01-02")], ["2026-01-02"])).toEqual([200]);
    expect(netWorthAtDates(accounts, [transfer("a", "gone", 40, "2026-01-02")], ["2026-01-02"])).toEqual([160]);
  });

  it("returns results in the order the dates were given, even if they are not sorted", () => {
    const tx = [income("c", 10, "2026-01-01"), income("c", 20, "2026-01-02"), income("c", 30, "2026-01-03")];
    expect(netWorthAtDates([acct("c")], tx, ["2026-01-03", "2026-01-01", "2026-01-02", "2026-01-01"])).toEqual([60, 10, 30, 10]);
  });

  it("does not modify the transactions or dates it is given", () => {
    const tx = [income("c", 10, "2026-01-03"), income("c", 20, "2026-01-01")];
    const dates = ["2026-01-05", "2026-01-02"];
    const txCopy = JSON.stringify(tx);
    const datesCopy = JSON.stringify(dates);
    netWorthAtDates([acct("c")], tx, dates);
    expect(JSON.stringify(tx)).toBe(txCopy);
    expect(JSON.stringify(dates)).toBe(datesCopy);
  });

  it("handles empty inputs", () => {
    expect(netWorthAtDates([acct("c", 50)], [], [])).toEqual([]);
    expect(netWorthAtDates([], [income("c", 10, "2026-01-01")], ["2026-01-01"])).toEqual([0]);
    expect(netWorthAtDates([acct("c", 50), acct("d", 25.5)], [], ["2026-01-01"])).toEqual([75.5]);
  });

  it("counts a transaction with a blank date at every date, as the original comparison did", () => {
    const accounts = [acct("c", 0)];
    const tx = [income("c", 10, ""), income("c", 5, "2026-02-01")];
    expect(netWorthAtDates(accounts, tx, ["2026-01-01", "2026-02-01"])).toEqual(netWorthByReplay(accounts, tx, ["2026-01-01", "2026-02-01"]));
    expect(netWorthAtDates(accounts, tx, ["2026-01-01", "2026-02-01"])).toEqual([10, 15]);
  });

  it("never counts a transaction whose date is missing or not text", () => {
    const accounts = [acct("c", 0)];
    const tx = [income("c", 10, undefined), income("c", 10, null), income("c", 10, 20260101), income("c", 1, "2026-01-01")];
    expect(netWorthAtDates(accounts, tx, ["2026-12-31"])).toEqual([1]);
    expect(netWorthAtDates(accounts, tx, ["2026-12-31"])).toEqual(netWorthByReplay(accounts, tx, ["2026-12-31"]));
  });

  it("if a damaged file repeats an account id, each copy gets the transactions, as computeBalance gives them", () => {
    const accounts = [acct("c", 100), acct("c", 5)];
    const tx = [income("c", 10, "2026-01-01")];
    expect(netWorthAtDates(accounts, tx, ["2026-01-01"])).toEqual(netWorthByReplay(accounts, tx, ["2026-01-01"]));
    expect(netWorthAtDates(accounts, tx, ["2026-01-01"])).toEqual([125]);
  });

  it("is exact in cents where float sums drift", () => {
    const accounts = [acct("c", 0.1)];
    const tx = [income("c", 0.2, "2026-01-01"), expense("c", 0.3, "2026-01-02")];
    expect(netWorthAtDates(accounts, tx, ["2026-01-01", "2026-01-02"])).toEqual([0.3, 0]);
  });
});

// A small seeded generator so a failure is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("netWorthAtDates matches the original replay on random and damaged data", () => {
  const DATE_POOL = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i * 4));
    return d.toISOString().slice(0, 10);
  });

  function randomCase(seed) {
    const r = rng(seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const cents = () => Math.round(r() * 250000) / 100;

    const ids = ["a", "b", "c", "d", "e", "f"].slice(0, 1 + Math.floor(r() * 6));
    const accounts = ids.map((id) => ({ id, type: pick(["checking", "savings", "credit", "loan", "cash"]), startingBalance: r() < 0.1 ? pick([undefined, "abc", NaN, "12.5"]) : cents() * (r() < 0.3 ? -1 : 1) }));
    if (r() < 0.1) accounts.push(acct(ids[0], cents())); // repeated id
    if (r() < 0.05) accounts.push({ type: "cash", startingBalance: 7 }); // no id at all

    const accountRef = () => (r() < 0.08 ? pick(["ghost", undefined, null]) : pick(ids));
    const txCount = Math.floor(r() * 400);
    const transactions = [];
    for (let i = 0; i < txCount; i++) {
      const roll = r();
      const date = r() < 0.03 ? pick(["", undefined, null, 20260101]) : pick(DATE_POOL);
      const amount = r() < 0.05 ? pick([NaN, "abc", undefined, "3.75", -2.5, 0]) : cents();
      const type = roll < 0.4 ? "expense" : roll < 0.7 ? "income" : roll < 0.97 ? "transfer" : "mystery";
      transactions.push({ type, accountId: accountRef(), toAccountId: type === "transfer" && r() < 0.1 ? accountRef() : pick(ids), amount, date });
    }

    const dates = [];
    const dateCount = Math.floor(r() * 30);
    for (let i = 0; i < dateCount; i++) dates.push(r() < 0.1 ? pick(["2025-12-31", "2027-06-01", "2026-02-30"]) : pick(DATE_POOL));
    return { accounts, transactions, dates };
  }

  it("gives identical results for 400 random ledgers", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { accounts, transactions, dates } = randomCase(seed);
      const expected = netWorthByReplay(accounts, transactions, dates);
      const actual = netWorthAtDates(accounts, transactions, dates);
      expect(actual, `seed ${seed}`).toEqual(expected);
    }
  });
});
