import { describe, expect, it } from "vitest";
import { MAX_NAV_SHORTCUTS, navShortcutKey, navShortcutTarget, navigationShortcuts, visibleNavIds } from "../Amble/utils/navigation";

const known = ["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "taxes", "more"];

describe("visibleNavIds", () => {
  it("keeps the saved order and drops hidden and unknown tabs", () => {
    const order = ["taxes", "dashboard", "ghost", "plan", "more"];
    const visible = { taxes: true, dashboard: true, ghost: true, plan: false, more: true };
    expect(visibleNavIds(order, visible, known)).toEqual(["taxes", "dashboard", "more"]);
  });

  it("treats a missing visibility entry as hidden, and bad input as empty", () => {
    expect(visibleNavIds(["dashboard", "plan"], { dashboard: true }, known)).toEqual(["dashboard"]);
    expect(visibleNavIds(undefined, undefined, known)).toEqual([]);
  });
});

describe("navShortcutTarget", () => {
  const ids = ["dashboard", "taxes", "more"];

  it("maps 1-9 to the Nth visible tab", () => {
    expect(navShortcutTarget("1", ids)).toBe("dashboard");
    expect(navShortcutTarget("2", ids)).toBe("taxes");
    expect(navShortcutTarget("3", ids)).toBe("more");
  });

  it("does nothing for a number past the last tab, or for any other key", () => {
    for (const key of ["4", "9", "0", "a", "10", "", "?", undefined, 5]) expect(navShortcutTarget(key, ids), String(key)).toBeNull();
  });
});

describe("navShortcutKey", () => {
  it("is the number that opens the tab, matching navShortcutTarget", () => {
    const ids = known.slice();
    ids.forEach((id, i) => {
      expect(navShortcutKey(ids, id)).toBe(String(i + 1));
      expect(navShortcutTarget(navShortcutKey(ids, id), ids)).toBe(id);
    });
  });

  it("has no key for a hidden tab or one past the ninth", () => {
    expect(navShortcutKey(["dashboard"], "taxes")).toBeNull();
    const many = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(navShortcutKey(many, "t8")).toBe("9");
    expect(navShortcutKey(many, "t9")).toBeNull();
  });
});

describe("navigationShortcuts", () => {
  it("lists the tabs in order with their number keys", () => {
    expect(navigationShortcuts([{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }])).toEqual([
      { keys: ["1"], label: "Alpha" },
      { keys: ["2"], label: "Beta" },
    ]);
    expect(navigationShortcuts(undefined)).toEqual([]);
  });

  it("stops at nine", () => {
    const tabs = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, label: `Tab ${i}` }));
    expect(navigationShortcuts(tabs)).toHaveLength(MAX_NAV_SHORTCUTS);
  });
});
