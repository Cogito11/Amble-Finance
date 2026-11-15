import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Briefcase, Download, ExternalLink, FileText, FolderOpen, Inbox, Search, Send, X } from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { FormCard } from "./FormCard";
import { TAX_FORMS, TAX_FORM_GROUPS, TAX_FORM_KINDS, formLinks, searchTaxForms } from "../../data/taxForms";

const GROUP_ICONS = {
  filing: FileText,
  selfEmployed: Briefcase,
  income: Inbox,
  handOver: Send,
  records: FolderOpen,
};

const KIND_NOTES = {
  "you-file": "You fill this out and submit it to the IRS. The IRS page explains how.",
  "you-receive": "A payer sends you this form. A blank copy from the IRS is handy for seeing what each box means.",
  "hand-over": "You give this form to the person or business that asked for it. It isn't sent to the IRS.",
};

// The Taxes tab: a searchable list of common IRS forms with a plain-language explanation of each and
// links to download them from irs.gov. It holds no saved data and makes no network requests of its own.
export function TaxesView() {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(null);
  const detailRef = useRef(null);

  const activeForm = activeId ? TAX_FORMS.find((f) => f.id === activeId) : null;
  const results = useMemo(() => searchTaxForms(query), [query]);

  // The list and the detail page share one scrolling area, so opening a form from far down the list
  // would otherwise leave you scrolled past the top of it.
  useEffect(() => {
    const el = detailRef.current;
    if (activeForm && el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
  }, [activeForm]);

  if (activeForm) {
    const links = formLinks(activeForm);
    return (
      <div className="tool-detail" ref={detailRef}>
        <button type="button" className="btn btn-ghost btn-sm tool-back-btn" onClick={() => setActiveId(null)}>
          <ArrowLeft size={14} /> All forms
        </button>

        <div className="tool-page-title"><FileText size={18} /> {activeForm.number}: {activeForm.title}</div>

        <div className="card">
          <div className="tax-detail-section">
            <div className="tax-detail-label">What it's for</div>
            <p className="tax-detail-text">{activeForm.summary}</p>
          </div>
          <div className="tax-detail-section">
            <div className="tax-detail-label">Who uses it</div>
            <p className="tax-detail-text">{activeForm.whoUses}</p>
          </div>
          <div className="tax-detail-section">
            <div className="tax-detail-label">When</div>
            <p className="tax-detail-text">{activeForm.when}</p>
          </div>
          <div className="tax-detail-section">
            <div className="tax-detail-label">What you do with it</div>
            <p className="tax-detail-text">
              <span className="tool-card-badge">{TAX_FORM_KINDS[activeForm.kind]}</span>
              {` ${KIND_NOTES[activeForm.kind]}`}
            </p>
          </div>
        </div>

        <div className="tax-detail-actions">
          <a className="btn btn-primary" href={links.pdf} target="_blank" rel="noreferrer noopener">
            <Download size={16} /> Download PDF
          </a>
          {links.instructions && (
            <a className="btn btn-ghost" href={links.instructions} target="_blank" rel="noreferrer noopener">
              <FileText size={16} /> Instructions (PDF)
            </a>
          )}
          <a className="btn btn-ghost" href={links.page} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={16} /> IRS page
          </a>
        </div>

        <p className="tax-disclaimer">
          These links open IRS.gov in your web browser. Amble doesn't contact the IRS and sends nothing about you.
          The IRS keeps each link pointed at the current version of the form, and its page has the latest deadlines
          and details. Amble isn't affiliated with the IRS, and this is a general guide, not tax advice.
        </p>
      </div>
    );
  }

  return (
    <div className="tools-view">
      <div className="tax-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search for forms"
            aria-label="Search tax forms"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="icon-btn" onClick={() => setQuery("")} title="Clear search" aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="tax-count">
          {results.length === TAX_FORMS.length ? `${TAX_FORMS.length} forms` : `${results.length} of ${TAX_FORMS.length} forms`}
        </span>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching forms"
          message="Try a form number like 1040, or a word like freelance, extension or retirement."
        />
      ) : (
        TAX_FORM_GROUPS.map((group) => {
          const forms = results.filter((f) => f.group === group.id);
          if (!forms.length) return null;
          const Icon = GROUP_ICONS[group.id] || FileText;
          return (
            <div key={group.id} className="tools-category">
              <div className="tools-category-title"><Icon size={15} /> {group.label}</div>
              <div className="tools-grid">
                {forms.map((form) => <FormCard key={form.id} form={form} onOpen={setActiveId} />)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
