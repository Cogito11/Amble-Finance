import { describe, expect, it } from "vitest";
import { mergeSidebarOrder } from "../Amble/utils/misc";

// Existing users have a saved sidebar order. When a new version adds a tab (like Taxes), it should land
// in a sensible spot instead of below "More", without disturbing anything the person already arranged.

const DEFAULT = ["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "taxes", "more"];

describe("mergeSidebarOrder", () => {
  it("a fresh install gets the default order", () => {
    expect(mergeSidebarOrder([], DEFAULT)).toEqual(DEFAULT);
  });

  it("an unchanged saved order stays exactly as it was", () => {
    expect(mergeSidebarOrder(DEFAULT, DEFAULT)).toEqual(DEFAULT);
  });

  it("a new tab goes just above More when More is last", () => {
    const saved = ["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "more"];
    expect(mergeSidebarOrder(saved, DEFAULT)).toEqual(DEFAULT);
  });

  it("keeps the person's own arrangement and only slots the new tab in", () => {
    const saved = ["tools", "dashboard", "accounts", "transactions", "status", "budgets", "plan", "more"];
    expect(mergeSidebarOrder(saved, DEFAULT)).toEqual(["tools", "dashboard", "accounts", "transactions", "status", "budgets", "plan", "taxes", "more"]);
  });

  it("appends the new tab at the end when the person has moved More somewhere else", () => {
    const saved = ["more", "dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools"];
    expect(mergeSidebarOrder(saved, DEFAULT)).toEqual(["more", "dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "taxes"]);
  });

  it("drops saved ids that no longer exist", () => {
    const saved = ["dashboard", "oldTab", "more"];
    expect(mergeSidebarOrder(saved, DEFAULT)).toEqual(["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "taxes", "more"]);
  });
});
