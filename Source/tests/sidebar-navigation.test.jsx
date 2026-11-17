import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIDEBAR_KEY } from "../Amble/constants";
import { fakeStorage, legacyStorage } from "./helpers";

// Drives the real <App/> to prove the sidebar's number keys follow what's visible and in what order, and
// that the numbers beside the tabs, the shortcuts lists and the Sidebar settings card all agree.

let storage, legacy, windowHandlers;
let App, MoreView, ShortcutsList;

function installBrowser() {
  globalThis.window = globalThis;
  globalThis.localStorage = legacy;
  globalThis.window.storage = storage;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.location = { search: "", href: "http://localhost/", reload() {} };
  globalThis.addEventListener = (type, fn) => { (windowHandlers[type] = windowHandlers[type] || []).push(fn); };
  globalThis.removeEventListener = (type, fn) => { windowHandlers[type] = (windowHandlers[type] || []).filter((f) => f !== fn); };
  globalThis.document = { title: "", activeElement: null, addEventListener() {}, removeEventListener() {}, createElement: () => ({ click() {}, style: {} }), body: {}, documentElement: { style: {} } };
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = fakeStorage();
  windowHandlers = {};
  legacy = legacyStorage();
  ({ default: App } = await import("../Amble/App"));
  ({ MoreView } = await import("../Amble/components/views/MoreView"));
  ({ ShortcutsList } = await import("../Amble/components/common/Shortcuts"));
  installBrowser();
});
afterEach(() => vi.restoreAllMocks());

const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 30)); }); };
async function mount() {
  let renderer;
  await act(async () => { renderer = TestRenderer.create(<App />); });
  await settle();
  return renderer;
}

const navButtons = (r) => r.root.findAll((n) => n.type === "button" && String(n.props.className || "").startsWith("nav-item"));
const labelOf = (btn) => textOf(btn.findAllByType("span")[0]);
const hintOf = (btn) => { const h = btn.findAll((n) => n.props && n.props.className === "nav-shortcut-hint"); return h.length ? textOf(h[0]) : null; };
const sidebar = (r) => navButtons(r).map((b) => [labelOf(b), hintOf(b)]);
const activeLabel = (r) => labelOf(navButtons(r).find((b) => / active/.test(b.props.className)));
const press = async (key) => { await act(async () => { (windowHandlers.keydown || []).forEach((fn) => fn({ key, metaKey: false, ctrlKey: false, preventDefault() {} })); }); };
const savePrefs = (prefs) => legacy.setItem(SIDEBAR_KEY, JSON.stringify(prefs));
const allVisible = () => Object.fromEntries(ALL.map((id) => [id, true]));
const numbersOn = () => savePrefs({ order: ALL, visible: allVisible(), footerMetric: "netWorth", showNumbers: NUMBERS_ON });
const NUMBERS_ON = true; // numbers are off by default, so tests that look at them turn them on first
const ALL = ["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "taxes", "more"];

describe("a new install", () => {
  it("shows every tab in the intended order, with no numbers beside them", async () => {
    const r = await mount();
    expect(sidebar(r)).toEqual([
      ["Dashboard", null], ["Transactions", null], ["Accounts", null], ["Status", null], ["Budgets", null],
      ["Plan", null], ["Tools", null], ["Taxes", null], ["More", null],
    ]);
  });

  it("numbers them 1-9 once the numbers are turned on", async () => {
    numbersOn();
    const r = await mount();
    expect(sidebar(r)).toEqual([
      ["Dashboard", "1"], ["Transactions", "2"], ["Accounts", "3"], ["Status", "4"], ["Budgets", "5"],
      ["Plan", "6"], ["Tools", "7"], ["Taxes", "8"], ["More", "9"],
    ]);
  });

  it("the number keys open those tabs", async () => {
    const r = await mount();
    for (const [i, expected] of ["Dashboard", "Transactions", "Accounts", "Status", "Budgets", "Plan", "Tools", "Taxes", "More"].entries()) {
      await press(String(i + 1));
      expect(activeLabel(r), `key ${i + 1}`).toBe(expected);
    }
  });

  it("the numbers are hidden from screen readers and the tab advertises its key", async () => {
    numbersOn();
    const r = await mount();
    const taxes = navButtons(r).find((b) => labelOf(b) === "Taxes");
    expect(taxes.props["aria-keyshortcuts"]).toBe("8");
    expect(taxes.findAll((n) => n.props && n.props.className === "nav-shortcut-hint")[0].props["aria-hidden"]).toBe("true");
  });
});

describe("hiding and reordering", () => {
  it("a hidden tab has no number and no key; the rest renumber", async () => {
    savePrefs({ order: ALL, visible: Object.fromEntries(ALL.map((id) => [id, id !== "plan"])), footerMetric: "netWorth", showNumbers: NUMBERS_ON });
    const r = await mount();
    expect(sidebar(r).map(([label]) => label)).toEqual(["Dashboard", "Transactions", "Accounts", "Status", "Budgets", "Tools", "Taxes", "More"]);
    expect(sidebar(r).map(([, hint]) => hint)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);

    await press("6");
    expect(activeLabel(r)).toBe("Tools");
    await press("8");
    expect(activeLabel(r)).toBe("More");
    await press("1");
    await press("9"); // nothing is ninth any more
    expect(activeLabel(r)).toBe("Dashboard");
  });

  it("follows a custom order", async () => {
    const order = ["taxes", "dashboard", "more", "transactions", "accounts", "status", "budgets", "plan", "tools"];
    savePrefs({ order, visible: allVisible(), footerMetric: "netWorth", showNumbers: NUMBERS_ON });
    const r = await mount();
    expect(sidebar(r).slice(0, 3)).toEqual([["Taxes", "1"], ["Dashboard", "2"], ["More", "3"]]);
    await press("1");
    expect(activeLabel(r)).toBe("Taxes");
    await press("3");
    expect(activeLabel(r)).toBe("More");
  });

  it("someone who hid Plan before still has it hidden, and sees Taxes added above More", async () => {
    savePrefs({
      order: ["dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "more"],
      visible: { dashboard: true, transactions: true, accounts: true, status: true, budgets: true, plan: false, tools: true, more: true },
      footerMetric: "netWorth",
    });
    const r = await mount();
    expect(sidebar(r).map(([label]) => label)).toEqual(["Dashboard", "Transactions", "Accounts", "Status", "Budgets", "Tools", "Taxes", "More"]);
  });
});

describe("the shortcuts lists", () => {
  it("About lists the current sidebar tabs in order", async () => {
    const order = ["taxes", "dashboard", "transactions", "accounts", "status", "budgets", "plan", "tools", "more"];
    savePrefs({ order, visible: Object.fromEntries(ALL.map((id) => [id, id !== "tools"])), footerMetric: "netWorth" });
    const r = await mount();
    await act(async () => { navButtons(r).find((b) => labelOf(b) === "More").props.onClick(); });
    const more = r.root.findByType(MoreView);
    expect(more.props.shortcutTabs.map((t) => t.label)).toEqual(["Taxes", "Dashboard", "Transactions", "Accounts", "Status", "Budgets", "Plan", "More"]);

    const aboutBtn = r.root.findAll((n) => n.type === "button" && /About/.test(textOf(n)) && String(n.props.className).includes("seg-btn"))[0];
    await act(async () => { aboutBtn.props.onClick(); });
    const list = r.root.findByType(ShortcutsList);
    const text = textOf(list);
    expect(text).toContain("Navigation");
    expect(text).not.toContain("follow your sidebar order"); // no explanatory line under the heading
    const rows = list.findAll((n) => n.props && n.props.className === "shortcut-row").map(textOf);
    expect(rows).toContain("Taxes1");
    expect(rows).toContain("Dashboard2");
    expect(rows).toContain("More8");
    expect(rows.some((row) => row.startsWith("Tools"))).toBe(false); // hidden
  });

  it("holding ? previews the same list", async () => {
    savePrefs({ order: ALL, visible: Object.fromEntries(ALL.map((id) => [id, id !== "plan"])), footerMetric: "netWorth" });
    const r = await mount();
    await press("?");
    const rows = r.root.findAll((n) => n.props && n.props.className === "shortcut-row").map(textOf);
    expect(rows).toContain("Budgets5");
    expect(rows).toContain("Tools6");
    expect(rows).toContain("Taxes7");
    expect(rows).toContain("More8");
    expect(rows.some((row) => row.startsWith("Plan"))).toBe(false);
  });

  it("ShortcutsList still shows the general shortcuts, and no Navigation group when there are no tabs", () => {
    const r = TestRenderer.create(<ShortcutsList tabs={[]} />);
    expect(textOf(r.root)).toContain("New transaction");
    expect(textOf(r.root)).not.toContain("Navigation");
  });
});

describe("More > Settings > Sidebar", () => {
  const settingsCards = (r) => r.root.findAll((n) => n.props && n.props.className === "card-title").map(textOf);

  it("sits below Dashboard and edits the same sidebar", async () => {
    numbersOn();
    const r = await mount();
    await act(async () => { navButtons(r).find((b) => labelOf(b) === "More").props.onClick(); });
    const titles = settingsCards(r);
    expect(titles.indexOf("Sidebar")).toBe(titles.indexOf("Dashboard") + 1);

    // Untick Plan from the card: the sidebar and its numbers update straight away.
    const planBox = r.root.findAll((n) => n.type === "input" && n.props.type === "checkbox" && textOf(n.parent) === "Plan")[0];
    await act(async () => { planBox.props.onChange(); });
    expect(sidebar(r).map(([label]) => label)).not.toContain("Plan");
    expect(sidebar(r).find(([label]) => label === "Taxes")[1]).toBe("7");
  });

  it("reordering there reorders the sidebar and its keys", async () => {
    numbersOn();
    const r = await mount();
    await act(async () => { navButtons(r).find((b) => labelOf(b) === "More").props.onClick(); });
    const rows = r.root.findAll((n) => n.props && String(n.props.className || "").startsWith("sidebar-settings-row") && n.type === "div");
    const dragged = rows.find((row) => textOf(row) === "Taxes");
    const target = rows.find((row) => textOf(row) === "Dashboard");
    await act(async () => { dragged.props.onDragStart(); });
    await act(async () => { target.props.onDrop({ preventDefault() {} }); });
    expect(sidebar(r)[0]).toEqual(["Taxes", "1"]);
    await press("1");
    expect(activeLabel(r)).toBe("Taxes");
  });
});

describe("the shortcut numbers beside the tabs can be turned off", () => {
  const seg = (r) => r.root.findByProps({ "aria-label": "Sidebar shortcut numbers" });
  const segBtn = (r, label) => seg(r).findAll((n) => n.type === "button" && textOf(n) === label)[0];
  const openSettings = async (r) => { await act(async () => { navButtons(r).find((b) => labelOf(b) === "More").props.onClick(); }); };

  it("is an On/Off control in the Appearance card, off by default", async () => {
    const r = await mount();
    await openSettings(r);
    const appearance = r.root.findAll((n) => n.props && n.props.className === "card").find((c) => textOf(c).startsWith("Appearance"));
    expect(appearance.findAll((n) => n.props && n.props["aria-label"] === "Sidebar shortcut numbers")).not.toHaveLength(0);
    expect(textOf(appearance)).toContain("Sidebar shortcut numbers");
    expect(segBtn(r, "On").props["aria-pressed"]).toBe(false);
    expect(segBtn(r, "Off").props["aria-pressed"]).toBe(true);
    expect(sidebar(r).every(([, hint]) => hint === null)).toBe(true);
  });

  it("is no longer in the Sidebar card or the Customize sidebar dialog", async () => {
    const r = await mount();
    await openSettings(r);
    const sidebarCard = r.root.findAll((n) => n.props && n.props.className === "card").find((c) => textOf(c).startsWith("Sidebar") && !textOf(c).startsWith("Sidebar shortcut"));
    expect(textOf(sidebarCard)).not.toContain("shortcut numbers");
    const customize = r.root.findAll((n) => n.type === "button" && (n.props.title === "Customize sidebar" || /Customize sidebar/.test(n.props["aria-label"] || "")))[0];
    await act(async () => { customize.props.onClick(); });
    expect(r.root.findAll((n) => n.type === "input" && n.props.type === "checkbox" && /shortcut numbers/.test(textOf(n.parent)))).toHaveLength(0);
  });

  it("turning them on shows a number beside every tab, and off hides them again; the keys work either way", async () => {
    const r = await mount();
    await openSettings(r);
    await press("2");
    expect(activeLabel(r)).toBe("Transactions"); // works with the numbers hidden
    await openSettings(r);
    await act(async () => { segBtn(r, "On").props.onClick(); });
    expect(segBtn(r, "On").props["aria-pressed"]).toBe(true);
    expect(sidebar(r)[1]).toEqual(["Transactions", "2"]);
    expect(sidebar(r).every(([, hint]) => hint !== null)).toBe(true);

    await act(async () => { segBtn(r, "Off").props.onClick(); });
    expect(sidebar(r).every(([, hint]) => hint === null)).toBe(true);
    expect(navButtons(r)[1].props["aria-keyshortcuts"]).toBe("2");
  });

  it("remembers the choice; a sidebar saved before this option existed has the numbers off", async () => {
    numbersOn();
    expect(sidebar(await mount()).every(([, hint]) => hint !== null)).toBe(true);

    legacy = legacyStorage();
    installBrowser();
    savePrefs({ order: ALL, visible: allVisible(), footerMetric: "netWorth" });
    expect(sidebar(await mount()).every(([, hint]) => hint === null)).toBe(true);
  });

  it("the On/Off buttons are padded like the Theme control", async () => {
    const r = await mount();
    await openSettings(r);
    expect(seg(r).props.className).toContain("theme-mode-seg");
  });
});

describe("the automatic-update switch lives in About, under the update button", () => {
  const fakeUpdater = () => {
    let current = { supported: true, autoCheck: true, reason: null, status: "idle", currentVersion: "1.7.5", version: null, percent: null, error: null };
    return {
      getState: async () => current, check: async () => current, download: async () => current, install: async () => current,
      setAutoCheck: async (enabled) => { current = { ...current, autoCheck: enabled }; return current; },
      onStateChange: () => () => {},
    };
  };
  const goToMore = async (r) => { await act(async () => { navButtons(r).find((b) => labelOf(b) === "More").props.onClick(); }); await settle(); };
  const tabButton = (r, label) => r.root.findAll((n) => n.type === "button" && String(n.props.className).includes("seg-btn") && textOf(n).includes(label))[0];

  it("is in About right after the Updates row, and no longer in Settings", async () => {
    globalThis.ambleUpdater = fakeUpdater();
    try {
      const r = await mount();
      await goToMore(r);
      expect(textOf(r.root)).not.toContain("Check for updates automatically"); // Settings tab

      await act(async () => { tabButton(r, "About").props.onClick(); });
      await settle();
      const rows = r.root.findAll((n) => n.props && n.props.className === "about-row").map((row) => textOf(row));
      const updates = rows.findIndex((t) => t.startsWith("Updates"));
      expect(updates).toBeGreaterThan(-1);
      expect(rows[updates + 1]).toContain("Automatic checks");
      expect(rows[updates + 1]).toContain("Check for updates automatically");
    } finally {
      delete globalThis.ambleUpdater;
    }
  });

  it("isn't shown on installs that can't update themselves", async () => {
    const r = await mount();
    await goToMore(r);
    await act(async () => { tabButton(r, "About").props.onClick(); });
    await settle();
    expect(textOf(r.root)).not.toContain("Automatic checks");
  });
});
