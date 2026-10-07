import { describe, expect, it } from "vitest";
import { accountTotals, netForMonth, sumAmounts, sumAmountsOfType } from "../Amble/state/totals";

const acct = (id, type) => ({ id, type });

describe("accountTotals", () => {
  const accounts = [acct("c", "checking"), acct("s", "savings"), acct("k", "credit"), acct("l", "loan")];

  it("computes net worth, assets, debt and cash", () => {
    const t = accountTotals(accounts, { c: 1000.1, s: 2000.2, k: -300.3, l: -4000.4 });
    expect(t.netWorth).toBe(-1300.4);
    expect(t.totalAssets).toBe(3000.3);
    expect(t.totalDebt).toBe(4300.7);
    expect(t.cash).toBe(3000.3);
  });

  it("is exact where raw float sums are not (0.1 + 0.2 style)", () => {
    const t = accountTotals(accounts, { c: 0.1, s: 0.2, k: -0.3, l: 0 });
    expect(t.netWorth).toBe(0);
  });

  it("a debt account sitting at float dust (-1e-16) is not 'debt'", () => {
    expect(accountTotals(accounts, { c: 0, s: 0, k: -1.1e-16, l: 0 }).totalDebt).toBe(0);
  });

  it("an overpaid credit card (positive balance) contributes 0 debt", () => {
    expect(accountTotals(accounts, { c: 0, s: 0, k: 25, l: 0 }).totalDebt).toBe(0);
  });

  it("tolerates a missing balance entry", () => {
    expect(accountTotals(accounts, {}).netWorth).toBe(0);
  });
});

describe("transaction sums", () => {
  const txs = [
    { type: "income", amount: 0.1, date: "2026-10-01" },
    { type: "income", amount: 0.2, date: "2026-10-02" },
    { type: "expense", amount: 0.3, date: "2026-10-03" },
    { type: "transfer", amount: 99, date: "2026-10-03" },
    { type: "income", amount: 5, date: "2026-09-30" },
  ];
  it("sums are exact", () => {
    expect(sumAmountsOfType(txs, "income")).toBe(5.3);
    expect(sumAmounts(txs.slice(0, 3))).toBe(0.6);
  });
  it("netForMonth is income minus expense for that month only, ignoring transfers", () => {
    expect(netForMonth(txs, "2026-10")).toBe(0);
    expect(netForMonth(txs, "2026-09")).toBe(5);
    expect(netForMonth(txs, "2025-01")).toBe(0);
  });
});
