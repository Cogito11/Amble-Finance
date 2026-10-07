import { describe, expect, it } from "vitest";
import { computeBalance } from "../Amble/state/accounts";
import { fromCents } from "../Amble/utils/money";
import { randomCents, seededRandom, splitCents } from "./helpers";

const tx = (type, amount, accountId = "a", toAccountId = null) => ({ id: "t" + Math.random(), type, amount, accountId, toAccountId, date: "2026-01-01" });

describe("computeBalance", () => {
  it("is exact for the classic float cases", () => {
    const account = { id: "a", startingBalance: 0 };
    expect(computeBalance(account, [tx("income", 0.1), tx("income", 0.2), tx("expense", 0.3)])).toBe(0);
    expect(computeBalance(account, Array(10).fill(0).map(() => tx("income", 0.1)).concat(tx("expense", 1)))).toBe(0);
  });

  it("starts from the starting balance and handles transfers in and out", () => {
    const a = { id: "a", startingBalance: 100 };
    const b = { id: "b", startingBalance: 0 };
    const txs = [tx("expense", 25.5, "a"), tx("transfer", 40, "a", "b"), tx("income", 10.25, "b")];
    expect(computeBalance(a, txs)).toBe(34.5);
    expect(computeBalance(b, txs)).toBe(50.25);
  });

  it("ignores transactions for other accounts and an account with none", () => {
    expect(computeBalance({ id: "a", startingBalance: 5 }, [tx("income", 9, "zzz")])).toBe(5);
    expect(computeBalance({ id: "a" }, [])).toBe(0);
  });

  it("a card paid off to the cent is exactly 0 - 20,000 random payoffs", () => {
    const rnd = seededRandom(7);
    for (let i = 0; i < 20000; i++) {
      const owedCents = 100 + Math.floor(rnd() * 500000);
      const payments = splitCents(rnd, owedCents, 2 + Math.floor(rnd() * 4));
      const card = { id: "a", startingBalance: -fromCents(owedCents) };
      const balance = computeBalance(card, payments.map((c) => tx("income", fromCents(c))));
      expect(balance).toBe(0);
    }
  });

  it("always equals the exact integer-cent total - 20,000 random ledgers", () => {
    const rnd = seededRandom(11);
    for (let i = 0; i < 20000; i++) {
      const startCents = Math.floor(rnd() * 100000);
      const entries = randomCents(rnd, 1 + Math.floor(rnd() * 15), 200000).map((c) => {
        const kind = rnd();
        return { c, type: kind < 0.4 ? "income" : kind < 0.8 ? "expense" : "transfer-out" };
      });
      let expected = startCents;
      const txs = entries.map(({ c, type }) => {
        if (type === "income") { expected += c; return tx("income", fromCents(c)); }
        if (type === "expense") { expected -= c; return tx("expense", fromCents(c)); }
        expected -= c; return tx("transfer", fromCents(c), "a", "other");
      });
      expect(computeBalance({ id: "a", startingBalance: fromCents(startCents) }, txs)).toBe(fromCents(expected));
    }
  });
});
