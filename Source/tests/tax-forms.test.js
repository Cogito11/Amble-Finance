import { describe, expect, it } from "vitest";
import {
  IRS_ORIGIN, TAX_FORMS, TAX_FORM_GROUPS, TAX_FORM_KINDS, allCatalogLinks, filterTaxForms, formLinks, getTaxForm, searchTaxForms,
} from "../Amble/data/taxForms";
import { NAV_ITEMS, VIEW_TITLES } from "../Amble/constants";

// The Taxes catalog is hand-written and its links are only ever built from file names, so these tests
// guard the things that would otherwise rot silently: duplicate entries, a link that leaves irs.gov,
// and text that goes stale every January (tax years, dollar amounts).

const ids = (forms) => forms.map((f) => f.id);

describe("tax form catalog", () => {
  it("has unique ids and every required field", () => {
    expect(new Set(ids(TAX_FORMS)).size).toBe(TAX_FORMS.length);
    for (const f of TAX_FORMS) {
      for (const field of ["id", "number", "title", "summary", "whoUses", "when", "pdf", "page"]) {
        expect(typeof f[field], `${f.id}.${field}`).toBe("string");
        expect(f[field].trim().length, `${f.id}.${field}`).toBeGreaterThan(0);
      }
      expect(Array.isArray(f.keywords), `${f.id}.keywords`).toBe(true);
      expect(f.keywords.every((k) => typeof k === "string" && k.trim()), `${f.id}.keywords`).toBe(true);
      expect(f.instructions === null || typeof f.instructions === "string", `${f.id}.instructions`).toBe(true);
    }
  });

  it("puts every form in a known group and gives it a known kind", () => {
    const groupIds = TAX_FORM_GROUPS.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    for (const f of TAX_FORMS) {
      expect(groupIds, f.id).toContain(f.group);
      expect(Object.keys(TAX_FORM_KINDS), f.id).toContain(f.kind);
    }
    for (const g of TAX_FORM_GROUPS) {
      expect(TAX_FORMS.some((f) => f.group === g.id), `group ${g.id} is empty`).toBe(true);
    }
  });

  it("stores plain file names, not URLs or paths", () => {
    for (const f of TAX_FORMS) {
      expect(f.pdf, f.id).toMatch(/^[a-z0-9]+\.pdf$/);
      if (f.instructions) expect(f.instructions, f.id).toMatch(/^[a-z0-9]+\.pdf$/);
      expect(f.page, f.id).toMatch(/^about-[a-z0-9-]+$/);
    }
  });

  it("builds only https://www.irs.gov links, with no query string or fragment", () => {
    const links = allCatalogLinks();
    expect(links.length).toBeGreaterThan(TAX_FORMS.length * 2);
    expect(new Set(links.map((l) => l.url)).size).toBeGreaterThan(0);
    for (const { form, kind, url } of links) {
      const u = new URL(url);
      expect(u.origin, `${form} ${kind}`).toBe(IRS_ORIGIN);
      expect(u.search, `${form} ${kind}`).toBe("");
      expect(u.hash, `${form} ${kind}`).toBe("");
    }
    const sample = formLinks(TAX_FORMS.find((f) => f.id === "1040"));
    expect(sample).toEqual({
      pdf: "https://www.irs.gov/pub/irs-pdf/f1040.pdf",
      instructions: "https://www.irs.gov/pub/irs-pdf/i1040gi.pdf",
      page: "https://www.irs.gov/forms-pubs/about-form-1040",
    });
    expect(formLinks(TAX_FORMS.find((f) => f.id === "4868")).instructions).toBeNull();
  });

  it("keeps year-specific and dollar figures out of the text (they go stale every January)", () => {
    for (const f of TAX_FORMS) {
      for (const field of ["number", "title", "summary", "whoUses", "when", "instructionsNote"]) {
        if (f[field] === undefined) continue; // instructionsNote is optional
        expect(f[field], `${f.id}.${field} mentions a year`).not.toMatch(/\b(19|20)\d{2}\b/);
        expect(f[field], `${f.id}.${field} mentions a dollar amount`).not.toMatch(/\$/);
      }
    }
  });
});

describe("searchTaxForms", () => {
  it("returns everything for an empty or blank query", () => {
    expect(searchTaxForms("")).toHaveLength(TAX_FORMS.length);
    expect(searchTaxForms("   ")).toHaveLength(TAX_FORMS.length);
    expect(searchTaxForms(undefined)).toHaveLength(TAX_FORMS.length);
  });

  it("finds a form by number however it's typed", () => {
    for (const q of ["w-4", "W-4", "w4", "W 4", "form w-4"]) {
      expect(ids(searchTaxForms(q)), q).toContain("w-4");
    }
    expect(ids(searchTaxForms("1040-es"))).toContain("1040-es");
    expect(ids(searchTaxForms("1099"))).toEqual(expect.arrayContaining(["1099-nec", "1099-int", "1099-div", "1099-b", "1099-r"]));
  });

  it("finds forms by everyday words, not just form numbers", () => {
    expect(ids(searchTaxForms("freelance"))).toEqual(expect.arrayContaining(["schedule-c", "1040-es", "1099-nec", "w-9"]));
    expect(ids(searchTaxForms("extension"))).toContain("4868");
    expect(ids(searchTaxForms("RETIREMENT"))).toContain("1099-r");
    expect(ids(searchTaxForms("amend"))).toContain("1040-x");
  });

  it("requires every word to match", () => {
    expect(ids(searchTaxForms("freelance extension"))).toEqual([]);
    expect(ids(searchTaxForms("freelance estimated"))).toContain("1040-es");
  });

  it("returns nothing when nothing matches", () => {
    expect(searchTaxForms("zzzzqq")).toEqual([]);
  });
});

describe("instructions", () => {
  it("an instructionsNote only appears on forms that have an instructions document", () => {
    for (const f of TAX_FORMS) {
      if (f.instructionsNote === undefined) continue;
      expect(typeof f.instructionsNote, f.id).toBe("string");
      expect(f.instructionsNote.trim().length, f.id).toBeGreaterThan(0);
      expect(f.instructions, `${f.id} has a note about instructions it doesn't have`).not.toBeNull();
    }
  });

  it("forms that share an instructions file say so", () => {
    const byFile = {};
    for (const f of TAX_FORMS) if (f.instructions) (byFile[f.instructions] ||= []).push(f);
    for (const [file, forms] of Object.entries(byFile)) {
      // Schedules and forms covered by the 1040's instructions are the only ones where one file serves
      // forms that look unrelated; every other shared file should carry a note explaining it.
      if (forms.length < 2 || file === "i1040gi.pdf") continue;
      for (const f of forms) expect(f.instructionsNote, `${f.id} shares ${file}`).toBeTruthy();
    }
  });
});

describe("the wider catalog", () => {
  it("includes the credit, payment and statement forms people most often need", () => {
    for (const id of ["schedule-1", "schedule-8812", "2441", "8863", "8829", "8606", "8888", "9465", "1040-v", "1099-k", "1099-g", "1098", "1098-t", "5498", "4506", "w-7", "8821"]) {
      expect(getTaxForm(id), id).not.toBeNull();
    }
    expect(getTaxForm("nope")).toBeNull();
  });

  it("forms you receive are filed under statements, never under 'you file'", () => {
    for (const f of TAX_FORMS.filter((x) => x.group === "statements")) expect(f.kind, f.id).toBe("you-receive");
  });
});

describe("filterTaxForms", () => {
  it("'all' keeps everything the search found", () => {
    expect(ids(filterTaxForms("", "all"))).toEqual(ids(TAX_FORMS));
    expect(ids(filterTaxForms("freelance", "all"))).toEqual(ids(searchTaxForms("freelance")));
  });

  it("keeps only the chosen kind", () => {
    for (const kind of Object.keys(TAX_FORM_KINDS)) {
      const found = filterTaxForms("", kind);
      expect(found.length, kind).toBeGreaterThan(0);
      expect(found.every((f) => f.kind === kind), kind).toBe(true);
    }
    expect(ids(filterTaxForms("", "you-receive"))).toContain("1099-nec");
    expect(ids(filterTaxForms("", "you-receive"))).not.toContain("1040");
  });

  it("combines a search with a kind", () => {
    const found = filterTaxForms("freelance", "hand-over");
    expect(ids(found)).toEqual(["w-9"]);
  });
});

describe("Taxes tab wiring", () => {
  it("is in the sidebar and has a title (which also enables pop-out)", () => {
    expect(NAV_ITEMS.map((n) => n.id)).toContain("taxes");
    expect(VIEW_TITLES.taxes).toBe("Taxes");
  });

  it("every sidebar tab still has a title", () => {
    for (const item of NAV_ITEMS) expect(VIEW_TITLES[item.id], item.id).toBeTruthy();
  });
});
