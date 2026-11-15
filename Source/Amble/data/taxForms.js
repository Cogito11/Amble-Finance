// Catalog behind the Taxes tab: a small, hand-written reference of common IRS forms.
//
// This is static code, not saved user data, so it can change shape freely between releases without
// a migration. Rules for editing it:
//
//  - Store file names ("slugs"), never full URLs. Every link is built by formLinks() below from the one
//    IRS_ORIGIN, so a typo here can never send someone to a site that isn't irs.gov (tax-forms.test.js
//    enforces this).
//  - The PDF links point at the IRS's "current revision" files, which the IRS replaces each year, so
//    never put a tax year in a label or description. The links keep working on their own.
//  - Describe what a form is for, not figures. No deadlines, thresholds or dollar amounts: those change
//    every year, and the IRS page linked from each entry is where to find them.
//  - `npm run check:irs-links` (also run weekly by GitHub Actions) requests every link and reports the
//    ones that no longer resolve.

export const IRS_ORIGIN = "https://www.irs.gov";
const PDF_BASE = `${IRS_ORIGIN}/pub/irs-pdf/`;
const PAGE_BASE = `${IRS_ORIGIN}/forms-pubs/`;

// Display order of the sections on the Taxes tab.
export const TAX_FORM_GROUPS = [
  { id: "filing", label: "Filing your return" },
  { id: "selfEmployed", label: "Self-employment & investing" },
  { id: "income", label: "Income forms you receive" },
  { id: "handOver", label: "Paperwork you hand over" },
  { id: "records", label: "Account & records" },
];

// What the person does with the form. Shown as a badge on each card.
export const TAX_FORM_KINDS = {
  "you-file": "You file",
  "you-receive": "You receive",
  "hand-over": "You hand over",
};

// pdf          file name under /pub/irs-pdf/ (required)
// instructions file name under /pub/irs-pdf/, or null when the instructions are part of the form itself
// page         the IRS's "About Form ..." page, under /forms-pubs/ (required)
export const TAX_FORMS = [
  /* ------------------------------ Filing your return ------------------------------ */
  {
    id: "1040",
    number: "Form 1040",
    title: "U.S. Individual Income Tax Return",
    group: "filing",
    kind: "you-file",
    summary: "The main form most people use to file their yearly federal income tax return and work out whether they owe more or get a refund.",
    whoUses: "Most U.S. citizens and residents who need to file a federal return.",
    when: "Once a year, for the tax year that just ended. The IRS page shows the current filing deadline.",
    keywords: ["income tax", "tax return", "annual", "refund", "file taxes", "federal"],
    pdf: "f1040.pdf",
    instructions: "i1040gi.pdf",
    page: "about-form-1040",
  },
  {
    id: "1040-sr",
    number: "Form 1040-SR",
    title: "U.S. Tax Return for Seniors",
    group: "filing",
    kind: "you-file",
    summary: "The same return as Form 1040, laid out with larger type. Taxpayers 65 or older can choose to use it.",
    whoUses: "Taxpayers age 65 or older who prefer it. It's optional; Form 1040 works too.",
    when: "Once a year, for the tax year that just ended.",
    keywords: ["senior", "retiree", "retired", "65", "older", "large print"],
    pdf: "f1040s.pdf",
    instructions: "i1040gi.pdf",
    page: "about-form-1040", // the IRS covers 1040 and 1040-SR on one page
  },
  {
    id: "1040-x",
    number: "Form 1040-X",
    title: "Amended U.S. Individual Income Tax Return",
    group: "filing",
    kind: "you-file",
    summary: "Corrects a return you already filed, for example to fix income, deductions or credits that were wrong or left out.",
    whoUses: "Anyone who needs to change a Form 1040 or 1040-SR they already filed.",
    when: "After you've filed and found a mistake. Check the IRS page for time limits and how to submit it.",
    keywords: ["amend", "amended", "correction", "correct", "mistake", "fix", "refund claim"],
    pdf: "f1040x.pdf",
    instructions: "i1040x.pdf",
    page: "about-form-1040x",
  },
  {
    id: "4868",
    number: "Form 4868",
    title: "Application for Automatic Extension of Time To File",
    group: "filing",
    kind: "you-file",
    summary: "Gives you more time to file your return. It does not give you more time to pay what you owe.",
    whoUses: "Anyone who can't finish their return by the filing deadline.",
    when: "Before the regular filing deadline. Paying your estimated balance by that deadline can limit penalties and interest.",
    keywords: ["extension", "extend", "more time", "late", "deadline", "delay"],
    pdf: "f4868.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-4868",
  },
  {
    id: "1040-es",
    number: "Form 1040-ES",
    title: "Estimated Tax for Individuals",
    group: "filing",
    kind: "you-file",
    summary: "Used to pay tax during the year on income that has no tax withheld, such as self-employment, interest, dividends or rent.",
    whoUses: "Freelancers, self-employed people and others whose income isn't covered by paycheck withholding.",
    when: "Paid in installments through the year (quarterly). The form lists the due dates for the year.",
    keywords: ["estimated", "quarterly", "freelance", "self-employed", "1099", "payment voucher", "pay as you go"],
    pdf: "f1040es.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-1040-es",
  },

  /* ------------------------------ Self-employment & investing ------------------------------ */
  {
    id: "schedule-c",
    number: "Schedule C (Form 1040)",
    title: "Profit or Loss From Business",
    group: "selfEmployed",
    kind: "you-file",
    summary: "Reports the income and expenses of a business you run yourself, to work out your net profit or loss.",
    whoUses: "Sole proprietors, freelancers, independent contractors and side-business owners.",
    when: "Filed with your Form 1040 for the year.",
    keywords: ["freelance", "self-employed", "sole proprietor", "side hustle", "gig", "business expenses", "contractor", "1099-nec"],
    pdf: "f1040sc.pdf",
    instructions: "i1040sc.pdf",
    page: "about-schedule-c-form-1040",
  },
  {
    id: "schedule-se",
    number: "Schedule SE (Form 1040)",
    title: "Self-Employment Tax",
    group: "selfEmployed",
    kind: "you-file",
    summary: "Works out the Social Security and Medicare tax you owe on your net earnings from self-employment.",
    whoUses: "People with self-employment income, usually alongside Schedule C.",
    when: "Filed with your Form 1040 for the year.",
    keywords: ["self-employment tax", "social security", "medicare", "freelance", "self-employed", "fica"],
    pdf: "f1040sse.pdf",
    instructions: "i1040sse.pdf",
    page: "about-schedule-se-form-1040",
  },
  {
    id: "8949",
    number: "Form 8949",
    title: "Sales and Other Dispositions of Capital Assets",
    group: "selfEmployed",
    kind: "you-file",
    summary: "Lists each sale of investments such as stocks, bonds or other property, with what you paid and what you sold it for, so your gains and losses can be calculated.",
    whoUses: "Anyone who sold investments or other capital assets during the year.",
    when: "Filed with Schedule D and your Form 1040.",
    keywords: ["capital gains", "stocks", "investments", "brokerage", "1099-b", "crypto", "sold"],
    pdf: "f8949.pdf",
    instructions: "i8949.pdf",
    page: "about-form-8949",
  },
  {
    id: "schedule-d",
    number: "Schedule D (Form 1040)",
    title: "Capital Gains and Losses",
    group: "selfEmployed",
    kind: "you-file",
    summary: "Totals your investment gains and losses (from Form 8949) and carries the result to your Form 1040.",
    whoUses: "Anyone who sold investments or other capital assets during the year.",
    when: "Filed with Form 8949 and your Form 1040.",
    keywords: ["capital gains", "capital losses", "stocks", "investments", "brokerage", "crypto"],
    pdf: "f1040sd.pdf",
    instructions: "i1040sd.pdf",
    page: "about-schedule-d-form-1040",
  },

  /* ------------------------------ Income forms you receive ------------------------------ */
  {
    id: "w-2",
    number: "Form W-2",
    title: "Wage and Tax Statement",
    group: "income",
    kind: "you-receive",
    summary: "Your employer's yearly report of what they paid you and how much tax they withheld. You use it to fill in your return.",
    whoUses: "Employees. Your employer prepares it and sends it to you.",
    when: "Sent to you early in the year, ahead of tax filing season. Contact your employer if you don't get yours.",
    keywords: ["wages", "employer", "withholding", "paycheck", "salary", "job"],
    pdf: "fw2.pdf",
    instructions: "iw2w3.pdf",
    page: "about-form-w-2",
  },
  {
    id: "1099-nec",
    number: "Form 1099-NEC",
    title: "Nonemployee Compensation",
    group: "income",
    kind: "you-receive",
    summary: "Reports business income paid to you as a freelancer or contractor rather than as an employee.",
    whoUses: "Freelancers, contractors and gig workers. The business that paid you prepares it.",
    when: "Sent to you early in the year when a client's payments to you are large enough to require reporting.",
    keywords: ["freelance", "contractor", "gig", "self-employed", "1099", "side hustle"],
    pdf: "f1099nec.pdf",
    instructions: "i1099mec.pdf",
    page: "about-form-1099-nec",
  },
  {
    id: "1099-int",
    number: "Form 1099-INT",
    title: "Interest Income",
    group: "income",
    kind: "you-receive",
    summary: "Reports interest you earned, for example from a savings account, CD or bond.",
    whoUses: "Anyone who earned interest from a bank or other payer.",
    when: "Sent to you early in the year by the bank or payer.",
    keywords: ["interest", "savings", "bank", "cd", "bonds", "high yield"],
    pdf: "f1099int.pdf",
    instructions: "i1099int.pdf",
    page: "about-form-1099-int",
  },
  {
    id: "1099-div",
    number: "Form 1099-DIV",
    title: "Dividends and Distributions",
    group: "income",
    kind: "you-receive",
    summary: "Reports dividends and certain other distributions paid to you, for example from stocks, ETFs or mutual funds.",
    whoUses: "Anyone who received dividends or fund distributions.",
    when: "Sent to you early in the year by the brokerage or fund company.",
    keywords: ["dividends", "stocks", "etf", "mutual funds", "brokerage", "investments"],
    pdf: "f1099div.pdf",
    instructions: "i1099div.pdf",
    page: "about-form-1099-div",
  },
  {
    id: "1099-b",
    number: "Form 1099-B",
    title: "Proceeds From Broker and Barter Exchange Transactions",
    group: "income",
    kind: "you-receive",
    summary: "Reports investments you sold through a broker. You use it to fill in Form 8949 and Schedule D.",
    whoUses: "Anyone who sold stocks, bonds or similar investments through a broker.",
    when: "Sent to you early in the year by the brokerage.",
    keywords: ["brokerage", "stocks", "capital gains", "sold", "investments", "crypto"],
    pdf: "f1099b.pdf",
    instructions: "i1099b.pdf",
    page: "about-form-1099-b",
  },
  {
    id: "1099-r",
    number: "Form 1099-R",
    title: "Distributions From Pensions, Annuities, Retirement Plans, IRAs and More",
    group: "income",
    kind: "you-receive",
    summary: "Reports money paid out to you from a retirement account or pension, such as an IRA, 401(k) or annuity.",
    whoUses: "Anyone who took a payout, withdrawal or rollover from a retirement plan.",
    when: "Sent to you early in the year by the plan or account provider.",
    keywords: ["retirement", "ira", "401k", "pension", "rollover", "withdrawal", "annuity"],
    pdf: "f1099r.pdf",
    instructions: "i1099r.pdf",
    page: "about-form-1099-r",
  },

  /* ------------------------------ Paperwork you hand over ------------------------------ */
  {
    id: "w-4",
    number: "Form W-4",
    title: "Employee's Withholding Certificate",
    group: "handOver",
    kind: "hand-over",
    summary: "Tells your employer how much federal income tax to withhold from each paycheck.",
    whoUses: "Employees, when starting a job or after a change such as marriage, a new child or a second job.",
    when: "Give it to your employer. It isn't sent to the IRS.",
    keywords: ["withholding", "paycheck", "new job", "employer", "allowances"],
    pdf: "fw4.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-w-4",
  },
  {
    id: "w-9",
    number: "Form W-9",
    title: "Request for Taxpayer Identification Number and Certification",
    group: "handOver",
    kind: "hand-over",
    summary: "Gives your name and taxpayer ID to a person or business that needs it to report payments made to you. You give it to them; you don't send it to the IRS.",
    whoUses: "Freelancers, contractors and others whom a client, bank or other payer asks for it.",
    when: "When a payer asks for it, usually before they pay you.",
    keywords: ["freelance", "contractor", "taxpayer id", "tin", "ssn", "ein", "client", "1099"],
    pdf: "fw9.pdf",
    instructions: "iw9.pdf",
    page: "about-form-w-9",
  },

  /* ------------------------------ Account & records ------------------------------ */
  {
    id: "4506-t",
    number: "Form 4506-T",
    title: "Request for Transcript of Tax Return",
    group: "records",
    kind: "you-file",
    summary: "Asks the IRS for a transcript, which is a summary of a past return or your account. Lenders and financial aid offices often ask for one.",
    whoUses: "Anyone who needs proof of past tax information, for example for a loan or financial aid.",
    when: "Whenever you need one. The IRS page also lists faster online options.",
    keywords: ["transcript", "mortgage", "loan", "verify income", "financial aid", "past return"],
    pdf: "f4506t.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-4506-t",
  },
  {
    id: "8822",
    number: "Form 8822",
    title: "Change of Address",
    group: "records",
    kind: "you-file",
    summary: "Tells the IRS you've moved so its mail reaches the right place.",
    whoUses: "Anyone whose mailing address has changed since they last filed.",
    when: "After you move.",
    keywords: ["move", "moved", "address", "mailing", "relocate"],
    pdf: "f8822.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-8822",
  },
];

// The three links for one form, always on irs.gov. `instructions` is null when the form has none.
export function formLinks(form) {
  return {
    pdf: `${PDF_BASE}${form.pdf}`,
    instructions: form.instructions ? `${PDF_BASE}${form.instructions}` : null,
    page: `${PAGE_BASE}${form.page}`,
  };
}

// Every URL the catalog can produce, for the link checker.
export function allCatalogLinks() {
  return TAX_FORMS.flatMap((form) => {
    const links = formLinks(form);
    return [
      { form: form.number, kind: "pdf", url: links.pdf },
      ...(links.instructions ? [{ form: form.number, kind: "instructions", url: links.instructions }] : []),
      { form: form.number, kind: "page", url: links.page },
    ];
  });
}

// "w4" should find "Form W-4", so punctuation and spacing are ignored when matching.
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Every word typed must match somewhere in the form's number, title, summary, audience or keywords.
export function searchTaxForms(query, forms = TAX_FORMS) {
  const tokens = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return forms;
  return forms.filter((form) => {
    const haystack = [form.number, form.title, form.summary, form.whoUses, ...form.keywords].join(" ").toLowerCase();
    const squashed = squash(haystack);
    return tokens.every((token) => {
      if (haystack.includes(token)) return true;
      const t = squash(token);
      return t.length > 0 && squashed.includes(t);
    });
  });
}
