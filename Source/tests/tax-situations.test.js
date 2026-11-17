import { describe, expect, it } from "vitest";
import { TAX_FORMS, getTaxForm } from "../Amble/data/taxForms";
import { TAX_SITUATIONS, getTaxSituation } from "../Amble/data/taxSituations";

// The "Which of these describes your situation?" finder is hand-written text pointing at catalog forms.
// These tests catch a reference to a form that doesn't exist (which would silently show nothing) and text
// that goes stale every January.

describe("tax situations", () => {
  it("has unique ids and the fields the finder shows", () => {
    expect(TAX_SITUATIONS.length).toBeGreaterThan(5);
    expect(new Set(TAX_SITUATIONS.map((s) => s.id)).size).toBe(TAX_SITUATIONS.length);
    expect(new Set(TAX_SITUATIONS.map((s) => s.label)).size).toBe(TAX_SITUATIONS.length);
    for (const s of TAX_SITUATIONS) {
      for (const field of ["id", "label", "answer"]) {
        expect(typeof s[field], `${s.id}.${field}`).toBe("string");
        expect(s[field].trim().length, `${s.id}.${field}`).toBeGreaterThan(0);
      }
      expect(s.label.length, `${s.id} label is too long for a button`).toBeLessThanOrEqual(70);
      expect(s.answer.trim().endsWith("."), `${s.id} answer should be full sentences`).toBe(true);
    }
  });

  it("every form it offers exists in the catalog, once, with a role", () => {
    for (const s of TAX_SITUATIONS) {
      expect(s.forms.length, s.id).toBeGreaterThan(0);
      expect(s.forms.length, `${s.id} offers too many forms`).toBeLessThanOrEqual(8);
      const seen = new Set();
      for (const { id, role } of s.forms) {
        expect(getTaxForm(id), `${s.id} points at unknown form "${id}"`).not.toBeNull();
        expect(seen.has(id), `${s.id} lists ${id} twice`).toBe(false);
        seen.add(id);
        expect(typeof role === "string" && role.trim().length > 0, `${s.id}/${id} role`).toBe(true);
      }
    }
  });

  it("names the forms it tells people to use (the answer mentions each primary form by number)", () => {
    // The first form in the list is the one the answer is about, so the answer should say its number.
    for (const s of TAX_SITUATIONS) {
      const first = getTaxForm(s.forms[0].id);
      const bare = first.number.replace(/ \(Form 1040\)$/, "").replace(/^Form /, "");
      expect(s.answer, `${s.id} answer doesn't mention ${first.number}`).toContain(bare);
    }
  });

  it("keeps years and dollar amounts out of the text (they go stale every January)", () => {
    for (const s of TAX_SITUATIONS) {
      const text = [s.label, s.answer, ...s.forms.map((f) => f.role)].join(" ");
      expect(text, s.id).not.toMatch(/\b(19|20)\d{2}\b/);
      expect(text, s.id).not.toMatch(/\$/);
    }
  });

  it("can be looked up by id", () => {
    expect(getTaxSituation("freelance").label).toMatch(/freelance/i);
    expect(getTaxSituation("nope")).toBeNull();
  });

  it("covers a good spread of the catalog", () => {
    const used = new Set(TAX_SITUATIONS.flatMap((s) => s.forms.map((f) => f.id)));
    expect(used.size / TAX_FORMS.length).toBeGreaterThan(0.8);
  });
});
