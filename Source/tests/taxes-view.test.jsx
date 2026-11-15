import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { TaxesView } from "../Amble/components/taxes/TaxesView";
import { IRS_ORIGIN, TAX_FORMS, TAX_FORM_GROUPS } from "../Amble/data/taxForms";

// Drives the real Taxes tab: the list, search, the detail page and its links.

const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));
const pageText = (r) => textOf(r.toJSON());
const cards = (r) => r.root.findAll((n) => n.type === "button" && n.props.className === "tax-card-main");
const links = (r) => r.root.findAllByType("a");
const linkLabelled = (r, label) => links(r).find((a) => textOf(a).includes(label));
const buttonLabelled = (r, label) => r.root.findAllByType("button").find((b) => textOf(b).includes(label));

function mount() {
  let r;
  act(() => { r = TestRenderer.create(<TaxesView />); });
  return r;
}
const type = (r, value) => act(() => { r.root.findByType("input").props.onChange({ target: { value } }); });

beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });

describe("<TaxesView/> list", () => {
  it("the search box says what it's for", () => {
    expect(mount().root.findByType("input").props.placeholder).toBe("Search for forms");
  });

  it("clicking the card's empty space opens the form, but clicking a link or the button doesn't double-fire", () => {
    const r = mount();
    const card = r.root.findAll((n) => n.type === "div" && n.props.className === "tax-card")[0];
    const target = (matches) => ({ closest: () => matches });
    act(() => { card.props.onClick({ target: target(true) }); }); // a link or button inside the card
    expect(cards(r)).toHaveLength(TAX_FORMS.length);
    act(() => { card.props.onClick({ target: target(null) }); }); // padding around the links
    expect(cards(r)).toHaveLength(0);
    expect(pageText(r)).toContain("What it's for");
  });

  it("shows every form, under every group", () => {
    const r = mount();
    const text = pageText(r);
    for (const f of TAX_FORMS) expect(text, f.id).toContain(f.number);
    for (const g of TAX_FORM_GROUPS) expect(text, g.id).toContain(g.label);
    expect(cards(r)).toHaveLength(TAX_FORMS.length);
    expect(text).toContain(`${TAX_FORMS.length} forms`);
  });

  it("every link opens irs.gov in a new window without leaking the opener", () => {
    const r = mount();
    const all = links(r);
    expect(all.length).toBe(TAX_FORMS.length * 2); // Download PDF + IRS page on each card
    for (const a of all) {
      expect(a.props.href.startsWith(`${IRS_ORIGIN}/`), a.props.href).toBe(true);
      expect(a.props.target).toBe("_blank");
      expect(a.props.rel).toContain("noopener");
      expect(a.props.rel).toContain("noreferrer");
    }
  });

  it("filters as you type, and says how many matched", () => {
    const r = mount();
    type(r, "w4");
    const text = pageText(r);
    expect(text).toContain("Form W-4");
    expect(text).not.toContain("Form 1040-ES");
    expect(text).toMatch(/\d+ of \d+ forms/);
    expect(cards(r).length).toBeLessThan(TAX_FORMS.length);
  });

  it("shows an empty state for a search that matches nothing, and can be cleared", () => {
    const r = mount();
    type(r, "zzzzqq");
    expect(pageText(r)).toContain("No matching forms");
    expect(cards(r)).toHaveLength(0);
    act(() => { r.root.findByProps({ "aria-label": "Clear search" }).props.onClick(); });
    expect(cards(r)).toHaveLength(TAX_FORMS.length);
    expect(pageText(r)).not.toContain("No matching forms");
  });
});

describe("<TaxesView/> detail page", () => {
  const open = (r, number) => act(() => { cards(r).find((c) => textOf(c).includes(number)).props.onClick(); });

  it("opens a form with its explanation and download links, and goes back", () => {
    const r = mount();
    open(r, "Form 1040-ES");
    const text = pageText(r);
    expect(text).toContain("What it's for");
    expect(text).toContain("Who uses it");
    expect(text).toContain("Estimated Tax for Individuals");
    expect(text).toContain("doesn't contact the IRS");
    expect(text).toContain("You fill this out and submit it to the IRS");
    expect(linkLabelled(r, "Download PDF").props.href).toBe("https://www.irs.gov/pub/irs-pdf/f1040es.pdf");
    expect(linkLabelled(r, "IRS page").props.href).toBe("https://www.irs.gov/forms-pubs/about-form-1040-es");
    expect(cards(r)).toHaveLength(0);

    act(() => { buttonLabelled(r, "All forms").props.onClick(); });
    expect(cards(r)).toHaveLength(TAX_FORMS.length);
  });

  it("offers the instructions link only for forms that have separate instructions", () => {
    const r = mount();
    open(r, "Form 1040");
    expect(linkLabelled(r, "Instructions").props.href).toBe("https://www.irs.gov/pub/irs-pdf/i1040gi.pdf");

    act(() => { buttonLabelled(r, "All forms").props.onClick(); });
    open(r, "Form 4868");
    expect(linkLabelled(r, "Instructions")).toBeUndefined();
    expect(linkLabelled(r, "Download PDF")).toBeDefined();
  });

  it("explains what to do with forms you receive or hand over", () => {
    const r = mount();
    open(r, "Form W-2");
    expect(pageText(r)).toContain("You receive");
    expect(pageText(r)).toContain("A payer sends you this form");
    act(() => { buttonLabelled(r, "All forms").props.onClick(); });
    open(r, "Form W-4");
    expect(pageText(r)).toContain("It isn't sent to the IRS");
  });
});
