import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Briefcase, ChevronDown, Compass, Download, ExternalLink, FileText, FolderOpen, HandCoins, Inbox, Search, Send, Wallet, X,
} from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { FormCard } from "./FormCard";
import { SituationFinder } from "./SituationFinder";
import {
  TAX_FORMS, TAX_FORM_GROUPS, TAX_FORM_KINDS, filterTaxForms, formLinks, getTaxForm, searchTaxForms,
} from "../../data/taxForms";

const GROUP_ICONS = {
  filing: FileText,
  credits: Wallet,
  selfEmployed: Briefcase,
  statements: Inbox,
  owing: HandCoins,
  handOver: Send,
  records: FolderOpen,
};

const KIND_NOTES = {
  "you-file": "You fill this out and submit it to the IRS. The IRS page explains how.",
  "you-receive": "A payer sends you this form. A blank copy from the IRS is handy for seeing what each box means.",
  "hand-over": "You give this form to the person or business that asked for it. It isn't sent to the IRS.",
};

// The "How to fill it out" section on a form's page. Most IRS forms have a separate instructions document;
// the rest print their instructions on the form itself. Forms you receive get a different title and lead
// because their IRS instructions are written for the business that prepares them, not for you.
function howToSection(form, instructionsLink) {
  const receive = form.kind === "you-receive";
  const title = receive ? "How to read it" : "How to fill it out";
  let text;
  if (!instructionsLink) {
    text = receive
      ? "There's no separate instructions document for this form. The notes for recipients are printed on the form itself, so look at the pages marked as your copy."
      : "The IRS doesn't publish a separate instructions document for this form. Its instructions are part of the form's own PDF (look at the pages around the fillable part), and the IRS page has more detail.";
  } else if (receive) {
    text = "The IRS instructions are written for the business that prepares this form. As the person receiving it, the \"Instructions for Recipient\" printed on your copy of the form explain each box, and the IRS instructions go deeper.";
  } else {
    text = "The IRS publishes line-by-line instructions that explain what each part of this form asks for and how to fill it out.";
  }
  return { title, text, note: instructionsLink ? form.instructionsNote : null };
}

// The Taxes tab: a situation finder, then a searchable, filterable list of common IRS forms with a
// plain-language explanation of each and links to download them from irs.gov. It holds no saved data and
// makes no network requests of its own.
export function TaxesView() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [finderOpen, setFinderOpen] = useState(false); // the situation finder starts closed
  const [situationId, setSituationId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const detailRef = useRef(null);
  const usingKeyboard = useRef(false); // how the filter dropdown was last used (see onKindChange)

  const activeForm = activeId ? getTaxForm(activeId) : null;
  const results = useMemo(() => filterTaxForms(query, kind), [query, kind]);
  // Chip counts follow the search box, so they show how many of each kind the current search matches.
  const counts = useMemo(() => {
    const found = searchTaxForms(query);
    const byKind = { all: found.length };
    for (const k of Object.keys(TAX_FORM_KINDS)) byKind[k] = found.filter((f) => f.kind === k).length;
    return byKind;
  }, [query]);

  // The list and the detail page share one scrolling area, so opening a form from far down the list
  // would otherwise leave you scrolled past the top of it.
  useEffect(() => {
    const el = detailRef.current;
    if (activeForm && el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
  }, [activeForm]);

  // A dropdown keeps focus after you pick from it with the mouse, which would leave it highlighted even after
  // choosing the default "All forms". So when the pick came from the mouse, let go of focus. Keyboard users keep it,
  // because arrowing through the options changes the value one step at a time.
  const onKindChange = (e) => {
    setKind(e.target.value);
    if (!usingKeyboard.current && typeof e.target.blur === "function") e.target.blur();
  };

  if (activeForm) {
    const links = formLinks(activeForm);
    const howTo = howToSection(activeForm, links.instructions);
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

        <div className="card tax-howto">
          <div className="tax-detail-label tax-howto-label"><BookOpen size={14} /> {howTo.title}</div>
          <p className="tax-detail-text">{howTo.text}</p>
          {howTo.note && <p className="tax-howto-note">{howTo.note}</p>}
          {links.instructions ? (
            <a className="btn btn-ghost" href={links.instructions} target="_blank" rel="noreferrer noopener">
              <BookOpen size={16} /> Instructions (PDF)
            </a>
          ) : (
            // The instructions are inside the form's own PDF, so this opens the same file as Download PDF.
            <a className="btn btn-ghost" href={links.pdf} target="_blank" rel="noreferrer noopener">
              <BookOpen size={16} /> Open form with its instructions
            </a>
          )}
        </div>

        <div className="tax-detail-actions">
          <a className="btn btn-primary" href={links.pdf} target="_blank" rel="noreferrer noopener">
            <Download size={16} /> Download PDF
          </a>
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

  const filtering = Boolean(query.trim()) || kind !== "all";
  const kindOptions = [["all", "All forms"], ...Object.entries(TAX_FORM_KINDS)];

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
        <label className={`tax-select${kind !== "all" ? " is-active" : ""}`}>
          <select
            aria-label="Filter by what you do with the form"
            value={kind}
            onChange={onKindChange}
            onPointerDown={() => { usingKeyboard.current = false; }}
            onKeyDown={() => { usingKeyboard.current = true; }}
          >
            {kindOptions.map(([id, label]) => <option key={id} value={id}>{`${label} (${counts[id]})`}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <button
          type="button"
          className={`tax-pill-btn${finderOpen ? " is-active" : ""}`}
          aria-expanded={finderOpen}
          aria-controls="tax-finder"
          onClick={() => setFinderOpen((open) => !open)}
        >
          <Compass size={14} /> Not sure what you need?
        </button>
        <span className="tax-count">
          {results.length === TAX_FORMS.length ? `${TAX_FORMS.length} forms` : `${results.length} of ${TAX_FORMS.length} forms`}
        </span>
      </div>

      {finderOpen && <SituationFinder selectedId={situationId} onSelect={setSituationId} onOpenForm={setActiveId} />}

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching forms"
          message={filtering
            ? "Try a different search, or set the filter to All forms to see every form."
            : "Try a form number like 1040, or a word like freelance, extension or retirement."}
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
