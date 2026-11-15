import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { TaxesView } from "../Amble/components/taxes/TaxesView";
import { IRS_ORIGIN, TAX_FORMS, TAX_FORM_GROUPS, formLinks, getTaxForm } from "../Amble/data/taxForms";
import { TAX_SITUATIONS, getTaxSituation } from "../Amble/data/taxSituations";

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

describe("<TaxesView/> kind filter", () => {
  const select = (r) => r.root.findByType("select");
  const choose = (r, value) => act(() => { select(r).props.onChange({ target: { value } }); });
  const optionText = (r, value) => textOf(select(r).findAllByType("option").find((o) => o.props.value === value));
  const count = (r, value) => Number(optionText(r, value).match(/\((\d+)\)$/)[1]);

  it("is a dropdown next to the search box with All forms / You file / You receive / You hand over and counts", () => {
    const r = mount();
    expect(select(r).props["aria-label"]).toBe("Filter by what you do with the form");
    expect(select(r).props.value).toBe("all");
    expect(select(r).findAllByType("option").map((o) => textOf(o).replace(/ \(\d+\)$/, ""))).toEqual(["All forms", "You file", "You receive", "You hand over"]);
    expect(count(r, "all")).toBe(TAX_FORMS.length);
    expect(count(r, "you-file") + count(r, "you-receive") + count(r, "hand-over")).toBe(TAX_FORMS.length);
    // same toolbar as the search box, and styled as a pill
    const toolbar = r.root.findByProps({ className: "tax-toolbar" });
    expect(toolbar.findAllByType("select")).toHaveLength(1);
    expect(toolbar.findAllByType("input")).toHaveLength(1);
  });

  it("lets go of focus after a mouse pick (so the default isn't left highlighted), but not while using the keyboard", () => {
    const r = mount();
    const pick = (value) => { let blurred = false; act(() => { select(r).props.onChange({ target: { value, blur: () => { blurred = true; } } }); }); return blurred; };
    act(() => { select(r).props.onPointerDown(); });
    expect(pick("you-receive")).toBe(true);
    act(() => { select(r).props.onKeyDown(); }); // arrowing through the options
    expect(pick("hand-over")).toBe(false);
    expect(pick("all")).toBe(false);
    act(() => { select(r).props.onPointerDown(); });
    expect(pick("you-file")).toBe(true);
  });

  it("narrows the list to one kind, and All forms brings everything back", () => {
    const r = mount();
    choose(r, "you-receive");
    const expected = TAX_FORMS.filter((f) => f.kind === "you-receive").length;
    expect(cards(r)).toHaveLength(expected);
    expect(pageText(r)).toContain(`${expected} of ${TAX_FORMS.length} forms`);
    expect(pageText(r)).toContain("Form 1099-NEC");
    expect(pageText(r)).not.toContain("Form 1040-ES");
    expect(r.root.findByProps({ className: "tax-select is-active" })).toBeDefined();

    choose(r, "all");
    expect(cards(r)).toHaveLength(TAX_FORMS.length);
  });

  it("combines with search, and its counts follow the search", () => {
    const r = mount();
    type(r, "freelance");
    expect(count(r, "hand-over")).toBe(1);
    choose(r, "hand-over");
    expect(cards(r)).toHaveLength(1);
    expect(pageText(r)).toContain("Form W-9");
  });

  it("an empty kind+search says how to get out of it", () => {
    const r = mount();
    choose(r, "you-receive");
    type(r, "extension");
    expect(pageText(r)).toContain("No matching forms");
    expect(pageText(r)).toContain("set the filter to All forms");
  });
});

describe("<TaxesView/> situation finder", () => {
  const toggle = (r) => r.root.findAllByType("button").find((b) => textOf(b).includes("Not sure what you need?"));
  const openFinder = (r) => act(() => { toggle(r).props.onClick(); });
  const finder = (r) => r.root.findByProps({ className: "tax-finder" });
  const options = (r) => r.root.findAll((n) => n.type === "button" && String(n.props.className).startsWith("tax-situation"));
  const findersShown = (r) => r.root.findAll((n) => n.type === "section" && n.props.className === "tax-finder");
  const option = (r, label) => options(r).find((b) => textOf(b).includes(label));
  const answer = (r) => r.root.findAll((n) => n.props && n.props.className === "tax-finder-answer");

  it("starts closed, with a 'Not sure what you need?' button in the toolbar that opens and closes it", () => {
    const r = mount();
    expect(findersShown(r)).toHaveLength(0);
    expect(toggle(r).props["aria-expanded"]).toBe(false);
    const toolbar = r.root.findByProps({ className: "tax-toolbar" });
    expect(toolbar.findAllByType("button").some((b) => textOf(b).includes("Not sure what you need?"))).toBe(true);
    openFinder(r);
    expect(findersShown(r)).toHaveLength(1);
    expect(toggle(r).props["aria-expanded"]).toBe(true);
    expect(toggle(r).props["aria-controls"]).toBe(findersShown(r)[0].props.id);
    // it opens below the search bar and above the list of forms
    const order = r.root.findAll((n) => n.type === "div" && ["tax-toolbar", "tools-category"].includes(n.props.className)).map((n) => n.props.className);
    expect(order[0]).toBe("tax-toolbar");
    expect(pageText(r).indexOf("Which of these describes your situation?")).toBeGreaterThan(pageText(r).indexOf("forms"));
    expect(pageText(r).indexOf("Which of these describes your situation?")).toBeLessThan(pageText(r).indexOf("Filing your return"));
    openFinder(r);
    expect(findersShown(r)).toHaveLength(0);
  });

  it("asks 'Which of these describes your situation?' and lists the situations with nothing selected", () => {
    const r = mount();
    openFinder(r);
    expect(textOf(finder(r).children[0])).toContain("Which of these describes your situation?");
    expect(options(r).length).toBe(TAX_SITUATIONS.length);
    expect(options(r).every((b) => b.props["aria-pressed"] === false)).toBe(true);
    expect(answer(r)).toHaveLength(0);
  });

  it("clicking a situation shows the explanation and a button per form that opens that form", () => {
    const r = mount();
    openFinder(r);
    const sold = getTaxSituation("sold-investments");
    act(() => { option(r, sold.label).props.onClick(); });
    expect(option(r, sold.label).props["aria-pressed"]).toBe(true);
    expect(answer(r)).toHaveLength(1);
    expect(textOf(answer(r)[0])).toContain(sold.answer);
    for (const { id } of sold.forms) {
      expect(r.root.findAllByProps({ "aria-label": `View ${getTaxForm(id).number}` }).length, id).toBeGreaterThan(0);
    }

    const first = getTaxForm(sold.forms[0].id);
    act(() => { r.root.findAllByProps({ "aria-label": `View ${first.number}` })[0].props.onClick(); });
    expect(pageText(r)).toContain("What it's for");
    expect(pageText(r)).toContain(`${first.number}: ${first.title}`);
    expect(linkLabelled(r, "Download PDF").props.href).toBe(formLinks(first).pdf);
  });

  it("clicking the same situation again hides the explanation; picking another swaps it", () => {
    const r = mount();
    openFinder(r);
    const a = getTaxSituation("freelance");
    const b = getTaxSituation("extension");
    act(() => { option(r, a.label).props.onClick(); });
    expect(textOf(answer(r)[0])).toContain(a.answer);
    act(() => { option(r, b.label).props.onClick(); });
    expect(textOf(answer(r)[0])).toContain(b.answer);
    expect(textOf(answer(r)[0])).not.toContain(a.answer);
    expect(option(r, a.label).props["aria-pressed"]).toBe(false);
    act(() => { option(r, b.label).props.onClick(); });
    expect(answer(r)).toHaveLength(0);
  });

  it("is still selected when you come back from a form", () => {
    const r = mount();
    openFinder(r);
    const s = getTaxSituation("extension");
    act(() => { option(r, s.label).props.onClick(); });
    act(() => { r.root.findAllByProps({ "aria-label": `View ${getTaxForm(s.forms[0].id).number}` })[0].props.onClick(); });
    act(() => { buttonLabelled(r, "All forms").props.onClick(); });
    expect(answer(r)).toHaveLength(1);
    expect(option(r, s.label).props["aria-pressed"]).toBe(true);
  });

  it("every situation can be opened, and each of its form buttons leads to a real page", () => {
    for (const s of TAX_SITUATIONS) {
      const r = mount();
    openFinder(r);
      act(() => { option(r, s.label).props.onClick(); });
      for (const { id } of s.forms) {
        const btn = r.root.findAllByProps({ "aria-label": `View ${getTaxForm(id).number}` })[0];
        expect(btn, `${s.id}/${id}`).toBeDefined();
        act(() => { btn.props.onClick(); });
        expect(pageText(r), `${s.id}/${id}`).toContain(getTaxForm(id).title);
        act(() => { buttonLabelled(r, "All forms").props.onClick(); });
      }
    }
  });
});

describe("<TaxesView/> how to fill it out", () => {
  const open = (r, number) => act(() => { cards(r).find((c) => textOf(c).includes(number)).props.onClick(); });

  it("has a 'How to fill it out' section with a link to the instructions PDF", () => {
    const r = mount();
    open(r, "Schedule C");
    const text = pageText(r);
    expect(text).toContain("How to fill it out");
    expect(text).toContain("line-by-line instructions");
    expect(linkLabelled(r, "Instructions (PDF)").props.href).toBe("https://www.irs.gov/pub/irs-pdf/i1040sc.pdf");
  });

  it("says so when the form has no separate instructions", () => {
    const r = mount();
    open(r, "Form 4868");
    const text = pageText(r);
    expect(text).toContain("How to fill it out");
    expect(text).toContain("doesn't publish a separate instructions document");
    expect(linkLabelled(r, "Instructions")).toBeUndefined();
    // The button opens the form's own PDF, where the instructions are.
    expect(linkLabelled(r, "Open form with its instructions").props.href).toBe("https://www.irs.gov/pub/irs-pdf/f4868.pdf");
  });

  it("for forms you receive it's 'How to read it', and points to the recipient instructions", () => {
    const r = mount();
    open(r, "Form 1099-NEC");
    const text = pageText(r);
    expect(text).toContain("How to read it");
    expect(text).not.toContain("How to fill it out");
    expect(text).toContain("Instructions for Recipient");
    expect(linkLabelled(r, "Instructions (PDF)")).toBeDefined();
  });

  it("shows a form's instructionsNote when it shares instructions with another form", () => {
    const r = mount();
    open(r, "Form 1040-SR");
    expect(pageText(r)).toContain(TAX_FORMS.find((f) => f.id === "1040-sr").instructionsNote);
  });

  it("every form's page has the section, and offers an instructions link only if the catalog has one", () => {
    TAX_FORMS.forEach((f, i) => {
      const r = mount();
      // Open by position, not by number: several form numbers are prefixes of others (1040 / 1040-ES).
      act(() => { cards(r)[i].props.onClick(); });
      const text = pageText(r);
      expect(text, f.id).toContain(`${f.number}: ${f.title}`);
      expect(text, f.id).toContain(f.kind === "you-receive" ? "How to read it" : "How to fill it out");
      const link = linkLabelled(r, "Instructions (PDF)");
      const bundled = linkLabelled(r, "Open form with its instructions");
      if (f.instructions) {
        expect(link.props.href, f.id).toBe(formLinks(f).instructions);
        expect(bundled, f.id).toBeUndefined();
      } else {
        expect(link, f.id).toBeUndefined();
        expect(bundled.props.href, f.id).toBe(formLinks(f).pdf);
      }
    });
  });
});
