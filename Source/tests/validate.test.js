import { describe, expect, it } from "vitest";
import { describeReport, parseBackupText, validateState, BACKUP_VERSION } from "../Amble/state/validate";
import { defaultState } from "../Amble/state/budgets";

const clean = () => {
  const s = defaultState();
  s.accounts = [{ id: "a", name: "Checking", type: "checking", startingBalance: 100, order: 0 }];
  s.transactions = [
    { id: "t1", type: "expense", amount: 5, date: "2026-10-01", accountId: "a", toAccountId: null, categoryId: null, description: "coffee" },
    { id: "t2", type: "income", amount: 50, date: "2026-10-02", accountId: "a", toAccountId: null, categoryId: null, description: "pay" },
  ];
  s.bills = [{ id: "b1", name: "Rent", type: "expense", amount: 900, accountId: "a", categoryId: null, dueDate: "2026-10-01", recurring: true, frequency: "monthly", endDate: null, completions: {} }];
  s.goals = [{ id: "g1", name: "Trip", targetAmount: 1000, targetDate: null, trackingMode: "account", accountId: "a", manualAmount: 0 }];
  return JSON.parse(JSON.stringify(s));
};
const run = (mutate, opts) => { const s = clean(); mutate(s); return validateState(s, opts); };
const repairText = (r) => r.report.repairs.map((x) => `${x.collection}: ${x.what}`);

describe("validateState: clean data", () => {
  it("accepts a good state with nothing repaired or set aside", () => {
    const r = validateState(clean());
    expect(r.ok).toBe(true);
    expect(r.report.repairedCount).toBe(0);
    expect(r.report.quarantinedCount).toBe(0);
    expect(r.report.counts).toMatchObject({ accounts: 1, transactions: 2, bills: 1, goals: 1 });
    expect(describeReport(r.report)).toBe("");
  });

  it("keeps records that were already fine as the very same objects (no needless re-renders)", () => {
    const input = clean();
    const r = validateState(input);
    expect(r.state.transactions[0]).toBe(input.transactions[0]);
    expect(r.state.accounts[0]).toBe(input.accounts[0]);
  });

  it("defaultState itself validates cleanly", () => {
    const r = validateState(JSON.parse(JSON.stringify(defaultState())));
    expect(r.ok).toBe(true);
    expect(r.report.repairedCount + r.report.quarantinedCount).toBe(0);
  });
});

describe("validateState: not even an object", () => {
  it.each([[null], [undefined], [[]], ["text"], [42], [true]])("rejects %s", (bad) => {
    const r = validateState(bad);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe("string");
  });

  it("never throws, even if reading a field blows up", () => {
    const hostile = { get accounts() { throw new Error("boom"); } };
    const r = validateState(hostile);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });
});

describe("transactions", () => {
  it("sets aside things that aren't records, and says why", () => {
    const r = run((s) => { s.transactions.push(null, 5, "oops", [], undefined); });
    expect(r.state.transactions).toHaveLength(2);
    expect(r.report.quarantined.map((q) => q.reason)).toEqual(Array(5).fill("not a record"));
  });

  it("sets aside an unknown type, a missing/garbage amount, and a negative amount - keeping the record itself", () => {
    const bad = [
      { id: "x1", type: "refund", amount: 5, date: "2026-10-01" },
      { id: "x2", type: "expense", amount: "abc", date: "2026-10-01" },
      { id: "x3", type: "expense", amount: null, date: "2026-10-01" },
      { id: "x4", type: "expense", date: "2026-10-01" },
      { id: "x5", type: "expense", amount: -9, date: "2026-10-01" },
    ];
    const r = run((s) => { s.transactions.push(...bad); });
    expect(r.state.transactions).toHaveLength(2);
    expect(r.report.quarantinedCount).toBe(5);
    expect(r.report.quarantined.map((q) => q.record.id)).toEqual(["x1", "x2", "x3", "x4", "x5"]); // the original, untouched
    expect(r.report.quarantined.map((q) => q.reason)).toEqual(["unknown transaction type", "no usable amount", "no usable amount", "no usable amount", "negative amount"]);
  });

  it("repairs an amount saved as text", () => {
    const r = run((s) => { s.transactions[0].amount = "12.50"; });
    expect(r.state.transactions[0].amount).toBe(12.5);
    expect(repairText(r)).toContain("transactions: amounts stored as text were converted to numbers");
    expect(r.report.quarantinedCount).toBe(0);
  });

  it("gives a record with no id a new one, and renames the later of two duplicates - keeping both", () => {
    const r = run((s) => { delete s.transactions[0].id; s.transactions[1].id = "dup"; s.transactions.push({ ...s.transactions[1] }); });
    const ids = r.state.transactions.map((t) => t.id);
    expect(r.state.transactions).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => typeof id === "string" && id !== "")).toBe(true);
    expect(ids).toContain("dup");
  });

  it("keeps a transaction with a blank or garbage date (the app flags those itself), but fixes types that would crash", () => {
    const r = run((s) => { s.transactions[0].date = "not a date"; delete s.transactions[1].date; s.transactions.push({ id: "n", type: "expense", amount: 1, date: 20261001 }); });
    expect(r.state.transactions[0].date).toBe("not a date");
    expect(r.state.transactions[1].date).toBe("");
    expect(r.state.transactions[2].date).toBe("");
    expect(r.report.quarantinedCount).toBe(0);
  });

  it("trims an ISO timestamp down to the date", () => {
    const r = run((s) => { s.transactions[0].date = "2026-10-04T00:00:00.000Z"; });
    expect(r.state.transactions[0].date).toBe("2026-10-04");
  });

  it("converts non-text descriptions and ids; leaves dangling account/category references alone", () => {
    const r = run((s) => { s.transactions[0].description = 42; s.transactions[0].accountId = "gone"; s.transactions[0].categoryId = "gone-too"; s.transactions[1].id = 7; });
    expect(r.state.transactions[0]).toMatchObject({ description: "42", accountId: "gone", categoryId: "gone-too" });
    expect(r.state.transactions[1].id).toBe("7");
    expect(r.report.quarantinedCount).toBe(0);
  });

  it("allows a zero amount (odd, but displayable)", () => {
    const r = run((s) => { s.transactions[0].amount = 0; });
    expect(r.state.transactions).toHaveLength(2);
  });
});

describe("accounts", () => {
  it("repairs rather than discards", () => {
    const r = run((s) => {
      s.accounts.push({ id: "b", type: "brokerage", startingBalance: "oops" }, { id: "c", name: "Card", type: "credit", startingBalance: "-250.5", interestRate: -3, closed: "yes" });
    });
    const [, b, c] = r.state.accounts;
    expect(b).toMatchObject({ name: "Untitled account", type: "checking", startingBalance: 0 });
    expect(c).toMatchObject({ startingBalance: -250.5, interestRate: null, closed: true });
    expect(r.report.quarantinedCount).toBe(0);
    expect(r.state.accounts.every((a) => typeof a.order === "number")).toBe(true);
  });

  it("only sets aside an account that isn't a record at all", () => {
    const r = run((s) => { s.accounts.push(null, "x"); });
    expect(r.state.accounts).toHaveLength(1);
    expect(r.report.quarantinedCount).toBe(2);
  });
});

describe("categories, budgets, bills, goals", () => {
  it("categories: repairs type / limit / planId", () => {
    const r = run((s) => { s.categories.push({ id: "cx", name: "", type: "weird", limit: -4, planId: 7 }); });
    expect(r.state.categories.at(-1)).toMatchObject({ name: "Untitled category", type: "expense", limit: 0, planId: null });
  });

  it("budgets: clears unreadable dates, repairs nested rows, sets aside nested junk", () => {
    const r = run((s) => {
      s.plans[0].startDate = "31/12/2026";
      s.plans[0].categories = [{ id: "pc", name: "Food", mode: "weird", bulkAmount: "x", items: [{ id: "i", name: "Milk", amount: -1, date: "nope" }, 5] }, null];
      s.plans[0].incomeItems = "not a list";
      s.plans[0].repeat = "monthly";
    });
    const plan = r.state.plans[0];
    expect(plan.startDate).toBeNull();
    expect(plan.categories).toHaveLength(1);
    expect(plan.categories[0]).toMatchObject({ mode: "bulk", bulkAmount: 0 });
    expect(plan.categories[0].items[0]).toMatchObject({ amount: 0, date: null });
    expect(plan.incomeItems).toEqual([]);
    expect(plan.repeat).toMatchObject({ enabled: false, frequency: "monthly" });
    expect(r.report.quarantined.length).toBeGreaterThanOrEqual(3); // the 5, the null, the non-list
  });

  it("bills: a bill with no id is repaired (it used to be silently dropped); no due date is set aside", () => {
    const r = run((s) => {
      delete s.bills[0].id;
      s.bills.push({ id: "nodate", name: "x", amount: 5 }, { id: "noamt", name: "y", dueDate: "2026-10-01" });
    });
    expect(r.state.bills).toHaveLength(1);
    expect(typeof r.state.bills[0].id).toBe("string");
    expect(r.report.quarantined.map((q) => q.reason).sort()).toEqual(["no usable amount", "no valid due date"]);
  });

  it("bills: repairs frequency, text amounts, and cleans paid-marks", () => {
    const r = run((s) => {
      Object.assign(s.bills[0], { amount: "900", frequency: "fortnightly", completions: { "2026-10-01": true, "2026-11-01": "tx9", "bad key": true, "2026-12-01": 5 } });
    });
    expect(r.state.bills[0]).toMatchObject({ amount: 900, frequency: "monthly", completions: { "2026-10-01": true, "2026-11-01": "tx9" } });
  });

  it("goals: repairs target, mode and amounts", () => {
    const r = run((s) => { Object.assign(s.goals[0], { targetAmount: "abc", trackingMode: "??", manualAmount: -5, targetDate: "x" }); });
    expect(r.state.goals[0]).toMatchObject({ targetAmount: 0, trackingMode: "manual", manualAmount: 0, targetDate: null });
  });
});

describe("collections, settings and unknown keys", () => {
  it("a collection that isn't a list is set aside whole and replaced with an empty list", () => {
    const r = run((s) => { s.transactions = "oops"; });
    expect(r.state.transactions).toEqual([]);
    expect(r.report.quarantined[0]).toMatchObject({ collection: "transactions", reason: "expected a list", record: "oops" });
  });

  it("currency: normalized, or reset (and reported) when unreadable", () => {
    expect(run((s) => { s.currency = "eur"; }).state.currency).toBe("EUR");
    const bad = run((s) => { s.currency = "dollars"; });
    expect(bad.state.currency).toBe("USD");
    expect(repairText(bad)).toContain("settings: an unreadable currency was reset to USD");
  });

  it("keeps unknown top-level keys when loading, drops them when importing", () => {
    expect(run((s) => { s.futureThing = { a: 1 }; }).state.futureThing).toEqual({ a: 1 });
    expect(run((s) => { s.futureThing = { a: 1 }; }, { keepUnknown: false }).state.futureThing).toBeUndefined();
  });

  it("data from before budgets existed gets general categories only, never orphaned budget categories", () => {
    const r = run((s) => { delete s.categories; delete s.plans; });
    expect(r.state.plans).toEqual([]);
    expect(r.state.categories.length).toBeGreaterThan(0);
    expect(r.state.categories.every((c) => !c.planId)).toBe(true);
  });

  it("describeReport words repairs and set-aside records", () => {
    const r = run((s) => { s.transactions[0].amount = "1"; s.transactions.push(null); });
    expect(describeReport(r.report)).toBe("repaired 1 record and set aside 1 that couldn't be read");
  });
});

describe("parseBackupText", () => {
  const exported = (data) => JSON.stringify({ app: "amble-finance", version: BACKUP_VERSION, exportedAt: "2026-10-04T10:00:00.000Z", data });

  it("accepts the file the app exports, and a bare state object", () => {
    const r = parseBackupText(exported(clean()));
    expect(r.ok).toBe(true);
    expect(r.state.transactions).toHaveLength(2);
    expect(r.exportedAt).toBe("2026-10-04T10:00:00.000Z");
    expect(parseBackupText(JSON.stringify(clean())).ok).toBe(true);
  });

  it("rejects things that aren't backups, with a reason, and changes nothing", () => {
    expect(parseBackupText("{not json").error).toMatch(/isn't valid JSON/);
    expect(parseBackupText("[1,2,3]").ok).toBe(false);
    expect(parseBackupText("42").ok).toBe(false);
    expect(parseBackupText(JSON.stringify({ hello: "world" })).error).toMatch(/doesn't look like an Amble backup/);
    expect(parseBackupText(JSON.stringify({ accounts: [], categories: [] })).ok).toBe(false); // transactions missing
  });

  it("rejects a backup from a newer version instead of importing it lossily", () => {
    const text = JSON.stringify({ app: "amble-finance", version: BACKUP_VERSION + 1, data: clean() });
    expect(parseBackupText(text).error).toMatch(/newer version/);
  });

  it("validates the contents and reports what it repaired / set aside", () => {
    const dirty = clean();
    dirty.transactions[0].amount = "12";
    dirty.transactions.push({ id: "z", type: "nope", amount: 1 });
    const r = parseBackupText(exported(dirty));
    expect(r.ok).toBe(true);
    expect(r.report.repairedCount).toBe(1);
    expect(r.report.quarantinedCount).toBe(1);
    expect(r.state.transactions).toHaveLength(2);
  });
});
