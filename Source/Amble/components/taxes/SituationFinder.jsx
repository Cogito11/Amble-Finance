import React from "react";
import { ChevronRight, Compass } from "lucide-react";
import { TAX_FORM_KINDS, getTaxForm } from "../../data/taxForms";
import { TAX_SITUATIONS, getTaxSituation } from "../../data/taxSituations";

// "Which of these describes your situation?": pick an everyday situation, read which forms go with it and
// what to do with them, then jump straight to a form. Pure display: the selected situation lives in
// TaxesView, so it's still selected when you come back from a form's page.
export function SituationFinder({ selectedId, onSelect, onOpenForm }) {
  const selected = getTaxSituation(selectedId);
  return (
    <section id="tax-finder" className="tax-finder" aria-labelledby="tax-finder-title">
      <div id="tax-finder-title" className="tax-finder-title"><Compass size={16} /> Which of these describes your situation?</div>
      <div className="tax-finder-options">
        {TAX_SITUATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`tax-situation${s.id === selectedId ? " is-active" : ""}`}
            aria-pressed={s.id === selectedId}
            onClick={() => onSelect(s.id === selectedId ? null : s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className="tax-finder-answer" role="region" aria-live="polite" aria-label={selected.label}>
          <p className="tax-detail-text">{selected.answer}</p>
          <div className="tax-finder-forms">
            {selected.forms.map(({ id, role }) => {
              const form = getTaxForm(id);
              if (!form) return null;
              return (
                <div key={id} className="tax-finder-form">
                  <div className="tax-finder-form-text">
                    <div className="tax-finder-form-name">
                      {form.number}
                      <span className="tool-card-badge">{TAX_FORM_KINDS[form.kind]}</span>
                    </div>
                    <div className="tax-finder-form-role">{role}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onOpenForm(id)}
                    aria-label={`View ${form.number}`}
                  >
                    View form <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
