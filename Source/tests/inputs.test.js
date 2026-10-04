import { describe, expect, it } from "vitest";
import { checkAccountForm, checkBillForm, checkBudgetForm, checkCategoryForm, checkGoalForm, checkTransactionForm, isSavableTransaction, moneyOrZero, parseContribution } from "../Amble/state/inputs";
import { isValidDateStr, monthKeyOf } from "../Amble/utils/dates";
import { MAX_MONEY, checkMoneyInput, parseMoneyInput } from "../Amble/utils/money";
import { fmtDate } from "../Amble/utils/format";
import { sortTransactionsNewestFirst } from "../Amble/utils/misc";

describe("isValidDateStr", () => {
  it("accepts real dates, including leap days", () => {
    for (const d of ["2026-10-04", "2024-02-29", "1900-01-01", "2200-12-31"]) expect(isValidDateStr(d), d).toBe(true);
  });
  it("rejects blanks, impossible dates, and over-long years", () => {
    for (const d of ["", null, undefined, 20261004, "2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "2026-10-00", "2026-1-4", "20256-01-01", "1899-12-31", "2201-01-01", "abc"]) {
      expect(isValidDateStr(d), String(d)).toBe(false);
    }
  });
});

describe("checkMoneyInput", () => {
  it("parses and rounds to cents", () => {
    expect(parseMoneyInput("12.345")).toBe(12.35);
    expect(parseMoneyInput(" 19.99 ")).toBe(19.99);
    expect(parseMoneyInput("1e3")).toBe(1000);
    expect(parseMoneyInput(25)).toBe(25);
  });
  it("rejects non-numeric, non-finite and absurd values (the 1e999 -> Infinity -> null-in-JSON bug)", () => {
    expect(checkMoneyInput("1e999").error).toBe("too_large");
    expect(checkMoneyInput("-1e999").error).toBe("too_large");
    expect(checkMoneyInput("Infinity").error).toBe("invalid");
    expect(checkMoneyInput("12abc").error).toBe("invalid");
    expect(checkMoneyInput("NaN").error).toBe("invalid");
    expect(checkMoneyInput(`${MAX_MONEY * 10}`).error).toBe("too_large");
    expect(checkMoneyInput(`${MAX_MONEY}`).error).toBeNull();
  });
  it("applies min after rounding", () => {
    expect(checkMoneyInput("0").error).toBe("too_small");
    expect(checkMoneyInput("0.004").error).toBe("too_small"); // rounds to 0.00
    expect(checkMoneyInput("-5").error).toBe("too_small");
    expect(checkMoneyInput("0", { min: 0 }).value).toBe(0);
    expect(checkMoneyInput("-5", { min: -MAX_MONEY }).value).toBe(-5);
  });
  it("blank is its own error", () => {
    expect(checkMoneyInput("").error).toBe("empty");
    expect(checkMoneyInput("   ").error).toBe("empty");
    expect(checkMoneyInput(null).error).toBe("empty");
  });
});

const goodTx = { type: "expense", date: "2026-10-04", amount: "12.345", accountId: "a", toAccountId: "" };

describe("checkTransactionForm", () => {
  it("accepts a good form and returns the amount rounded to cents", () => {
    expect(checkTransactionForm(goodTx)).toMatchObject({ valid: true, hint: "", amount: 12.35 });
  });
  it("blank date is rejected (the 'Invalid Date' transaction bug)", () => {
    const r = checkTransactionForm({ ...goodTx, date: "" });
    expect(r.valid).toBe(false);
    expect(r.hint).toBe("Choose a date.");
  });
  it("garbage dates are rejected", () => {
    for (const date of ["20256-01-01", "2026-02-30"]) {
      expect(checkTransactionForm({ ...goodTx, date })).toMatchObject({ valid: false, kind: "invalid" });
    }
  });
  it("rejects bad amounts with a reason", () => {
    expect(checkTransactionForm({ ...goodTx, amount: "" })).toMatchObject({ valid: false, kind: "empty", hint: "Enter an amount." });
    expect(checkTransactionForm({ ...goodTx, amount: "0" })).toMatchObject({ valid: false, hint: "Amount must be greater than zero." });
    expect(checkTransactionForm({ ...goodTx, amount: "1e999" })).toMatchObject({ valid: false, hint: "That amount is too large." });
    expect(checkTransactionForm({ ...goodTx, amount: "-3" }).valid).toBe(false);
  });
  it("needs an account, and a different destination for transfers", () => {
    expect(checkTransactionForm({ ...goodTx, accountId: "" }).hint).toBe("Choose an account.");
    expect(checkTransactionForm({ ...goodTx, type: "transfer" }).hint).toBe("Choose the account to transfer to.");
    expect(checkTransactionForm({ ...goodTx, type: "transfer", toAccountId: "a" }).hint).toBe("Choose two different accounts.");
    expect(checkTransactionForm({ ...goodTx, type: "transfer", toAccountId: "b" }).valid).toBe(true);
  });
});

describe("checkBillForm", () => {
  const good = { name: "Rent", amount: "1200", accountId: "a", dueDate: "2026-10-01", recurring: true, hasEndDate: false, endDate: "" };
  it("accepts a good bill", () => expect(checkBillForm(good)).toMatchObject({ valid: true, amount: 1200 }));
  it("requires name, amount, account and a valid due date", () => {
    expect(checkBillForm({ ...good, name: "  " }).valid).toBe(false);
    expect(checkBillForm({ ...good, amount: "1e999" }).valid).toBe(false);
    expect(checkBillForm({ ...good, accountId: "" }).valid).toBe(false);
    expect(checkBillForm({ ...good, dueDate: "" }).valid).toBe(false);
    expect(checkBillForm({ ...good, dueDate: "2026-02-30" }).valid).toBe(false);
  });
  it("validates the end date only when one is being used", () => {
    expect(checkBillForm({ ...good, hasEndDate: true, endDate: "20256-01-01" }).valid).toBe(false);
    expect(checkBillForm({ ...good, hasEndDate: false, endDate: "20256-01-01" }).valid).toBe(true);
    expect(checkBillForm({ ...good, recurring: false, hasEndDate: true, endDate: "garbage" }).valid).toBe(true);
  });
});

describe("checkAccountForm", () => {
  it("accepts zero, negative and decimal balances (overdrawn accounts exist)", () => {
    expect(checkAccountForm({ name: "A", balanceInput: "0" })).toMatchObject({ valid: true, balance: 0, interestRate: null });
    expect(checkAccountForm({ name: "A", balanceInput: "-50.555" })).toMatchObject({ valid: true, balance: -50.56 });
  });
  it("rejects blank/absurd balances and bad interest rates", () => {
    expect(checkAccountForm({ name: "A", balanceInput: "" }).valid).toBe(false);
    expect(checkAccountForm({ name: "A", balanceInput: "1e999" }).valid).toBe(false);
    expect(checkAccountForm({ name: "A", balanceInput: "5", interestRateInput: "-1" }).valid).toBe(false);
    expect(checkAccountForm({ name: "A", balanceInput: "5", interestRateInput: "1e999" }).valid).toBe(false);
    expect(checkAccountForm({ name: "A", balanceInput: "5", interestRateInput: "4.5" })).toMatchObject({ valid: true, interestRate: 4.5 });
    expect(checkAccountForm({ name: "A", balanceInput: "5", interestRateInput: "" }).interestRate).toBeNull();
  });
});

describe("checkGoalForm", () => {
  const good = { name: "Trip", targetAmount: "1000", trackingMode: "account", accountId: "a", manualAmount: "", targetDate: "" };
  it("accepts a good goal", () => expect(checkGoalForm(good)).toMatchObject({ valid: true, targetAmount: 1000 }));
  it("manual mode validates the manual amount; account mode ignores it", () => {
    expect(checkGoalForm({ ...good, trackingMode: "manual", accountId: "", manualAmount: "250.5" })).toMatchObject({ valid: true, manualAmount: 250.5 });
    expect(checkGoalForm({ ...good, trackingMode: "manual", manualAmount: "-5" }).valid).toBe(false);
    expect(checkGoalForm({ ...good, trackingMode: "account", manualAmount: "garbage" }).valid).toBe(true);
  });
  it("rejects bad targets and bad target dates", () => {
    expect(checkGoalForm({ ...good, targetAmount: "0" }).valid).toBe(false);
    expect(checkGoalForm({ ...good, targetDate: "2026-99-99" }).valid).toBe(false);
    expect(checkGoalForm({ ...good, trackingMode: "account", accountId: "" }).valid).toBe(false);
  });
});

describe("checkBudgetForm", () => {
  const base = { name: "Oct", startDate: "", endDate: "", incomeItems: [], cats: [] };
  it("a name alone is enough", () => expect(checkBudgetForm(base).valid).toBe(true));
  it("blank amounts mean zero", () => {
    expect(checkBudgetForm({ ...base, incomeItems: [{ mode: "manual", amount: "" }], cats: [{ name: "Food", mode: "bulk", bulkAmount: "" }] }).valid).toBe(true);
  });
  it("rejects bad typed amounts and says which row", () => {
    const r = checkBudgetForm({ ...base, cats: [{ name: "Food", mode: "bulk", bulkAmount: "1e999" }] });
    expect(r.valid).toBe(false);
    expect(r.hint).toContain("Food");
    expect(checkBudgetForm({ ...base, incomeItems: [{ mode: "manual", name: "Pay", amount: "-5" }] }).hint).toContain("Pay");
    expect(checkBudgetForm({ ...base, cats: [{ name: "Subs", mode: "items", items: [{ name: "Netflix", amount: "abc" }] }] }).hint).toContain("Netflix");
  });
  it("ignores hidden boxes (items-mode bulk amount, category-tracked income amount)", () => {
    expect(checkBudgetForm({ ...base, cats: [{ name: "Subs", mode: "items", bulkAmount: "garbage", items: [] }] }).valid).toBe(true);
    expect(checkBudgetForm({ ...base, incomeItems: [{ mode: "category", amount: "garbage" }] }).valid).toBe(true);
  });
  it("rejects invalid dates (but blank is fine)", () => {
    expect(checkBudgetForm({ ...base, startDate: "20256-01-01" }).valid).toBe(false);
    expect(checkBudgetForm({ ...base, endDate: "2026-02-30" }).valid).toBe(false);
  });
  it("moneyOrZero rounds valid text and zeroes junk", () => {
    expect(moneyOrZero("12.345")).toBe(12.35);
    expect(moneyOrZero("")).toBe(0);
    expect(moneyOrZero("1e999")).toBe(0);
    expect(moneyOrZero("-5")).toBe(0);
  });
});

describe("isSavableTransaction (last line of defence in saveTransaction)", () => {
  const t = { date: "2026-10-04", amount: 5 };
  it("accepts sane transactions", () => expect(isSavableTransaction(t)).toBe(true));
  it("rejects blank dates, non-finite, zero, negative and huge amounts", () => {
    for (const bad of [{ ...t, date: "" }, { ...t, date: undefined }, { ...t, amount: Infinity }, { ...t, amount: NaN }, { ...t, amount: 0 }, { ...t, amount: -1 }, { ...t, amount: 1e13 }, null]) {
      expect(isSavableTransaction(bad)).toBe(false);
    }
  });
});

describe("damaged-date resilience (records saved before validation existed)", () => {
  it("fmtDate shows 'No date' instead of 'Invalid Date'", () => {
    expect(fmtDate("")).toBe("No date");
    expect(fmtDate(undefined)).toBe("No date");
    expect(fmtDate("2026-10-04")).toBe("Oct 4, 2026");
  });
  it("monthKeyOf and the newest-first sort don't throw on missing dates", () => {
    expect(monthKeyOf("")).toBe("");
    expect(monthKeyOf(undefined)).toBe("");
    const sorted = sortTransactionsNewestFirst([{ id: 1, date: "" }, { id: 2, date: "2026-10-01" }, { id: 3 }]);
    expect(sorted[0].id).toBe(2);
    expect(sorted).toHaveLength(3);
  });
});

describe("checkCategoryForm", () => {
  it("limit is optional and rounded to cents", () => {
    expect(checkCategoryForm({ name: "Pets", type: "expense", limit: "" })).toMatchObject({ valid: true, limit: 0 });
    expect(checkCategoryForm({ name: "Pets", type: "expense", limit: "150.555" })).toMatchObject({ valid: true, limit: 150.56 });
  });
  it("rejects bad limits, but an income category ignores the limit box entirely", () => {
    expect(checkCategoryForm({ name: "Pets", type: "expense", limit: "1e999" }).valid).toBe(false);
    expect(checkCategoryForm({ name: "Pets", type: "expense", limit: "-5" }).valid).toBe(false);
    expect(checkCategoryForm({ name: "Pay", type: "income", limit: "garbage" })).toMatchObject({ valid: true, limit: 0 });
    expect(checkCategoryForm({ name: "", type: "expense", limit: "" }).valid).toBe(false);
  });
});

describe("parseContribution (quick-add on a manual goal)", () => {
  it("accepts positive amounts, rounded to cents", () => {
    expect(parseContribution("25")).toBe(25);
    expect(parseContribution("10.005")).toBe(10.01);
  });
  it("rejects blank, zero, negative, junk and overflow (Infinity used to be added)", () => {
    for (const bad of ["", "0", "-5", "abc", "1e999", undefined]) expect(parseContribution(bad), String(bad)).toBeNull();
  });
});
