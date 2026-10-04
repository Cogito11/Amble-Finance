import { describe, expect, it } from "vitest";
import { goalProgress } from "../Amble/state/planning";
import { computeBalance } from "../Amble/state/accounts";
import { fromCents } from "../Amble/utils/money";
import { seededRandom, splitCents } from "./helpers";

const TODAY = "2026-10-03";
const deposit = (amount) => ({ id: "x", type: "income", amount, accountId: "s", date: "2026-01-01" });

describe("goalProgress", () => {
  it("manual goal: achieved exactly at target, not before", () => {
    expect(goalProgress({ targetAmount: 100, trackingMode: "manual", manualAmount: 100 }, {}, TODAY).achieved).toBe(true);
    expect(goalProgress({ targetAmount: 100, trackingMode: "manual", manualAmount: 99.99 }, {}, TODAY).achieved).toBe(false);
  });

  it("clamps percentage to 0-100 and handles a zero target", () => {
    expect(goalProgress({ targetAmount: 100, trackingMode: "manual", manualAmount: 250 }, {}, TODAY).pct).toBe(100);
    expect(goalProgress({ targetAmount: 0, trackingMode: "manual", manualAmount: 5 }, {}, TODAY)).toMatchObject({ pct: 0, achieved: false });
  });

  it("account-tracked goal funded to exactly the target is achieved - 20,000 random deposit splits", () => {
    const rnd = seededRandom(3);
    const goal = { targetAmount: 1000, trackingMode: "account", accountId: "s" };
    for (let i = 0; i < 20000; i++) {
      const parts = splitCents(rnd, 100000, 2 + Math.floor(rnd() * 5));
      const balance = computeBalance({ id: "s", startingBalance: 0 }, parts.map((c) => deposit(fromCents(c))));
      const progress = goalProgress(goal, { s: balance }, TODAY);
      expect(progress.achieved).toBe(true);
      expect(progress.pct).toBe(100);
    }
  });

  it("a balance that is 1e-9 under the target still counts (float dust, not a real shortfall)", () => {
    expect(goalProgress({ targetAmount: 1000, trackingMode: "account", accountId: "s" }, { s: 999.9999999999999 }, TODAY).achieved).toBe(true);
  });

  it("a real one-cent shortfall does not count", () => {
    expect(goalProgress({ targetAmount: 1000, trackingMode: "account", accountId: "s" }, { s: 999.99 }, TODAY).achieved).toBe(false);
  });
});
