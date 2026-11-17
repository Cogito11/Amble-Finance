import React from "react";
import { ChevronRight, Download, ExternalLink, FileText } from "lucide-react";
import { TAX_FORM_KINDS, formLinks } from "../../data/taxForms";

// One form in the Taxes list. Clicking anywhere on the card opens the form's detail page, except the two
// links underneath, which go straight to irs.gov. They open in the person's own browser (Electron hands target="_blank" links to the
// system browser), so Amble itself never contacts the IRS.
export function FormCard({ form, onOpen }) {
  const links = formLinks(form);
  return (
    // The inner button handles keyboard use and its own clicks; this handler covers the rest of the card
    // (the padding around the links) so the hover highlight matches what a click does.
    <div className="tax-card" onClick={(e) => { if (!e.target.closest("a, button")) onOpen(form.id); }}>
      <button type="button" className="tax-card-main" onClick={() => onOpen(form.id)}>
        <div className="tool-card-icon"><FileText size={18} /></div>
        <div className="tool-card-text">
          <div className="tool-card-title">
            {form.number}
            <span className="tool-card-badge">{TAX_FORM_KINDS[form.kind]}</span>
          </div>
          <div className="tax-card-name">{form.title}</div>
          <div className="tool-card-desc">{form.summary}</div>
        </div>
        <ChevronRight size={16} className="tool-card-chevron" />
      </button>
      <div className="tax-card-actions">
        <a
          className="btn btn-ghost btn-sm"
          href={links.pdf}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Download ${form.number} PDF from IRS.gov`}
        >
          <Download size={14} /> Download PDF
        </a>
        <a
          className="btn btn-ghost btn-sm"
          href={links.page}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open the IRS page for ${form.number}`}
        >
          <ExternalLink size={14} /> IRS page
        </a>
      </div>
    </div>
  );
}
