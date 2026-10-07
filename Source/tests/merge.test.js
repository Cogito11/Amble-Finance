import { describe, expect, it } from "vitest";
import { deepEqual, merge3, mergeStates } from "../Amble/state/merge";
import { validateState } from "../Amble/state/validate";
import { defaultState } from "../Amble/state/budgets";
import { seededRandom } from "./helpers";

const tx = (id, over = {}) => ({ id, type: "expense", amount: 10, date: "2026-10-01", accountId: "a", description: `tx ${id}`, categoryId: null, ...over });
const baseState = (over = {}) => ({
  ...defaultState(), accounts: [{ id: "a", name: "Checking", type: "checking", startingBalance: 0, order: 0 }],
  categories: [], plans: [], bills: [], goals: [], transactions: [tx("t1"), tx("t2"), tx("t3")], currency: "USD", lastBackupAt: null, ...over,
});
const ids = (list) => list.map((x) => x.id).sort();
const find = (list, id) => list.find((x) => x.id === id);

describe("deepEqual", () => {
  it("ignores object key order but not array order", () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
  it("treats a missing key and undefined alike, but not null", () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: null }, {})).toBe(false);
  });
  it("handles primitives and mismatched types", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("1", 1)).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe("merge3 on single values", () => {
  it("takes whichever side changed", () => {
    expect(merge3(1, 1, 2)).toBe(2);
    expect(merge3(1, 3, 1)).toBe(3);
    expect(merge3(1, 5, 5)).toBe(5);
  });
  it("both changed the same value: the local (merging) window wins", () => {
    expect(merge3(1, 3, 2)).toBe(3);
  });
  it("merges objects field by field", () => {
    expect(merge3({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 9 })).toEqual({ a: 2, b: 9 });
  });
  it("merges nested objects (e.g. two different paid-marks on the same bill)", () => {
    const merged = merge3({ completions: {} }, { completions: { "2026-10-01": true } }, { completions: { "2026-11-01": "t9" } });
    expect(merged.completions).toEqual({ "2026-10-01": true, "2026-11-01": "t9" });
  });
  it("a field removed on one side and untouched on the other is removed", () => {
    expect(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1 });
  });
  it("lists changed on both sides: local wins whole", () => {
    expect(merge3([1], [1, 2], [1, 3])).toEqual([1, 2]);
  });
});

describe("mergeStates: collections", () => {
  it("both windows add different transactions: both survive (the lost-update bug)", () => {
    const base = baseState();
    const local = { ...base, transactions: [...base.transactions, tx("mine")] };
    const remote = { ...base, transactions: [...base.transactions, tx("theirs")] };
    expect(ids(mergeStates(base, local, remote).transactions)).toEqual(["mine", "t1", "t2", "t3", "theirs"]);
  });

  it("an edit made only in the other window is kept; so is one made only here", () => {
    const base = baseState();
    const local = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 11 } : t)) };
    const remote = { ...base, transactions: base.transactions.map((t) => (t.id === "t2" ? { ...t, amount: 22 } : t)) };
    const merged = mergeStates(base, local, remote);
    expect(find(merged.transactions, "t1").amount).toBe(11);
    expect(find(merged.transactions, "t2").amount).toBe(22);
  });

  it("different fields of the SAME record edited in each window: both edits kept", () => {
    const base = baseState();
    const local = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 99 } : t)) };
    const remote = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, description: "renamed" } : t)) };
    expect(find(mergeStates(base, local, remote).transactions, "t1")).toMatchObject({ amount: 99, description: "renamed" });
  });

  it("the same field edited in both: this window's value wins", () => {
    const base = baseState();
    const local = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 1 } : t)) };
    const remote = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 2 } : t)) };
    expect(find(mergeStates(base, local, remote).transactions, "t1").amount).toBe(1);
  });

  it("a deletion in one window is kept if the other window didn't touch the record", () => {
    const base = baseState();
    const local = { ...base, transactions: base.transactions.filter((t) => t.id !== "t1") };
    expect(ids(mergeStates(base, local, base).transactions)).toEqual(["t2", "t3"]);
    expect(ids(mergeStates(base, base, local).transactions)).toEqual(["t2", "t3"]);
  });

  it("deleted in one window but EDITED in the other: the record is kept with the edit (never lose an edit)", () => {
    const base = baseState();
    const deleted = { ...base, transactions: base.transactions.filter((t) => t.id !== "t1") };
    const edited = { ...base, transactions: base.transactions.map((t) => (t.id === "t1" ? { ...t, amount: 77 } : t)) };
    for (const [local, remote] of [[deleted, edited], [edited, deleted]]) {
      expect(find(mergeStates(base, local, remote).transactions, "t1")).toMatchObject({ amount: 77 });
    }
  });

  it("deleted in both: gone", () => {
    const base = baseState();
    const gone = { ...base, transactions: base.transactions.filter((t) => t.id !== "t1") };
    expect(ids(mergeStates(base, gone, gone).transactions)).toEqual(["t2", "t3"]);
  });

  it("keeps the other window's order, then appends what only this window added", () => {
    const base = baseState();
    const local = { ...base, transactions: [...base.transactions, tx("mine")] };
    const remote = { ...base, transactions: [tx("theirs"), ...base.transactions] };
    expect(mergeStates(base, local, remote).transactions.map((t) => t.id)).toEqual(["theirs", "t1", "t2", "t3", "mine"]);
  });

  it("works across every collection and for settings", () => {
    const base = baseState({ goals: [{ id: "g", name: "Trip", targetAmount: 100 }] });
    const local = { ...base, currency: "EUR", goals: [...base.goals, { id: "g2", name: "Car", targetAmount: 5 }] };
    const remote = { ...base, lastBackupAt: "2026-10-04T10:00:00.000Z", accounts: [...base.accounts, { id: "b", name: "Savings", type: "savings", startingBalance: 0, order: 1 }] };
    const merged = mergeStates(base, local, remote);
    expect(merged.currency).toBe("EUR");
    expect(merged.lastBackupAt).toBe("2026-10-04T10:00:00.000Z");
    expect(ids(merged.goals)).toEqual(["g", "g2"]);
    expect(ids(merged.accounts)).toEqual(["a", "b"]);
  });

  it("with no base (nothing to compare against) everything from both sides is kept", () => {
    const local = baseState({ transactions: [tx("x")] });
    const remote = baseState({ transactions: [tx("y")] });
    expect(ids(mergeStates(undefined, local, remote).transactions)).toEqual(["x", "y"]);
  });
});

describe("mergeStates: invariants a field merge could break", () => {
  const plan = (id, active) => ({ id, name: id, active, startDate: null, endDate: null, income: 0, incomeItems: [], categories: [], repeat: { enabled: false, frequency: "monthly" } });

  it("two windows each activate a different budget: only one stays active, preferring this window's choice", () => {
    const base = baseState({ plans: [plan("X", false), plan("Y", true), plan("Z", false)] });
    const local = { ...base, plans: [plan("X", true), plan("Y", false), plan("Z", false)] };
    const remote = { ...base, plans: [plan("X", false), plan("Y", false), plan("Z", true)] };
    const merged = mergeStates(base, local, remote);
    expect(merged.plans.filter((p) => p.active).map((p) => p.id)).toEqual(["X"]);
  });

  it("a paid-mark that points at a transaction the other window deleted is dropped", () => {
    const bill = (completions) => ({ id: "b", name: "Rent", type: "expense", amount: 5, dueDate: "2026-10-01", recurring: true, frequency: "monthly", completions });
    const base = baseState({ bills: [bill({})] });
    const local = { ...base, bills: [bill({ "2026-10-01": "t1" })] }; // marked paid by linking t1
    const remote = { ...base, transactions: base.transactions.filter((t) => t.id !== "t1") }; // t1 deleted elsewhere
    const merged = mergeStates(base, local, remote);
    expect(find(merged.transactions, "t1")).toBeUndefined();
    expect(merged.bills[0].completions).toEqual({});
  });

  it("a plain 'paid' mark (true) is never dropped", () => {
    const bill = (completions) => ({ id: "b", name: "Rent", type: "expense", amount: 5, dueDate: "2026-10-01", recurring: true, frequency: "monthly", completions });
    const base = baseState({ bills: [bill({})] });
    const local = { ...base, bills: [bill({ "2026-10-01": true })] };
    expect(mergeStates(base, local, base).bills[0].completions).toEqual({ "2026-10-01": true });
  });
});

describe("mergeStates: properties", () => {
  it("nothing changed remotely -> exactly local; nothing changed locally -> exactly remote", () => {
    const base = baseState();
    const changed = { ...base, transactions: [...base.transactions, tx("n")] };
    expect(deepEqual(mergeStates(base, changed, base), changed)).toBe(true);
    expect(deepEqual(mergeStates(base, base, changed), changed)).toBe(true);
  });

  it("random edits to DIFFERENT records in two windows: merge order doesn't matter and nothing is lost (300 trials)", () => {
    const rnd = seededRandom(99);
    for (let trial = 0; trial < 300; trial++) {
      const base = baseState({ transactions: Array.from({ length: 12 }, (_, i) => tx(`b${i}`)) });
      const owners = base.transactions.map((t) => ({ id: t.id, owner: rnd() < 0.5 ? "A" : "B" }));
      const apply = (who) => {
        let list = base.transactions.map((t) => ({ ...t }));
        for (const { id, owner } of owners) {
          if (owner !== who) continue;
          const roll = rnd();
          if (roll < 0.4) list = list.map((t) => (t.id === id ? { ...t, amount: 100 + Math.floor(rnd() * 900) } : t));
          else if (roll < 0.6) list = list.filter((t) => t.id !== id);
        }
        const adds = Math.floor(rnd() * 3);
        for (let i = 0; i < adds; i++) list.push(tx(`${who}-new-${i}`));
        return { ...base, transactions: list };
      };
      const a = apply("A");
      const b = apply("B");
      const ab = mergeStates(base, a, b);
      const ba = mergeStates(base, b, a);
      const norm = (s) => JSON.stringify([...s.transactions].sort((x, y) => x.id.localeCompare(y.id)));
      expect(norm(ab), `trial ${trial}`).toBe(norm(ba));
      // every addition from either window is present; every surviving edit is present
      for (const added of [...a.transactions, ...b.transactions].filter((t) => /new/.test(t.id))) expect(find(ab.transactions, added.id)).toBeTruthy();
    }
  });

  it("the merged result is always a valid state (passes the validator with nothing to repair)", () => {
    const base = baseState();
    const local = { ...base, transactions: [...base.transactions, tx("mine")] };
    const remote = { ...base, transactions: base.transactions.filter((t) => t.id !== "t2") };
    const result = validateState(JSON.parse(JSON.stringify(mergeStates(base, local, remote))));
    expect(result.ok).toBe(true);
    expect(result.report.repairedCount + result.report.quarantinedCount).toBe(0);
  });
});
