import { describe, expect, it } from "vitest";
import { compareMoney, fromCents, moneyAtLeast, moneyEquals, roundMoney, sumMoney, sumMoneyBy, toCents } from "../Amble/utils/money";
import { roundMoney as roundMoneyFromMisc } from "../Amble/utils/misc";
import { randomCents, seededRandom } from "./helpers";

describe("toCents / roundMoney", () => {
  it("converts clean amounts exactly", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.1)).toBe(10);
    expect(toCents(-0.3)).toBe(-30);
    expect(toCents(0)).toBe(0);
  });

  it("rounds sub-cent values the way a person expects (half away from zero)", () => {
    expect(roundMoney(12.345)).toBe(12.35); // 12.345 * 100 === 1234.4999999999998 in binary
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-2.675)).toBe(-2.68);
    expect(roundMoney(0.004)).toBe(0);
  });

  it("never returns -0", () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
    expect(Object.is(toCents(-0.0001), 0)).toBe(true);
  });

  it("treats non-finite and non-numeric input as 0", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, "abc", {}]) {
      expect(toCents(bad)).toBe(0);
      expect(roundMoney(bad)).toBe(0);
    }
  });

  it("accepts numeric strings (as typed into inputs)", () => {
    expect(toCents("19.99")).toBe(1999);
  });

  it("misc.roundMoney is the same function (existing imports keep working)", () => {
    expect(roundMoneyFromMisc(12.345)).toBe(12.35);
  });
});

describe("sumMoney", () => {
  it("fixes the classic float cases", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the problem
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([0.1, 0.2, -0.3])).toBe(0);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
  });

  it("handles empty input and sumMoneyBy", () => {
    expect(sumMoney([])).toBe(0);
    expect(sumMoneyBy([{ a: 0.1 }, { a: 0.2 }], (x) => x.a)).toBe(0.3);
  });

  it("matches exact integer-cent arithmetic for 50,000 random lists", () => {
    const rnd = seededRandom(1);
    for (let i = 0; i < 50000; i++) {
      const cents = randomCents(rnd, 1 + Math.floor(rnd() * 12), 500000);
      const expected = cents.reduce((s, c) => s + c, 0);
      expect(toCents(sumMoney(cents.map(fromCents)))).toBe(expected);
    }
  });
});

describe("comparisons", () => {
  it("compare at cent precision, ignoring float dust", () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyAtLeast(999.9999999999999, 1000)).toBe(true);
    expect(compareMoney(5, 5.01)).toBeLessThan(0);
    expect(compareMoney(5.01, 5)).toBeGreaterThan(0);
  });
});
