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
//  - `npm run check:irs-links` (also available as a manual GitHub Actions run) requests every link and reports the
//    ones that no longer resolve.

export const IRS_ORIGIN = "https://www.irs.gov";
const PDF_BASE = `${IRS_ORIGIN}/pub/irs-pdf/`;
const PAGE_BASE = `${IRS_ORIGIN}/forms-pubs/`;

// Display order of the sections on the Taxes tab.
export const TAX_FORM_GROUPS = [
  { id: "filing", label: "Filing your return" },
  { id: "credits", label: "Credits, deductions & adjustments" },
  { id: "selfEmployed", label: "Self-employment & investing" },
  { id: "statements", label: "Statements you receive" },
  { id: "owing", label: "Paying what you owe" },
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
// instructions file name under /pub/irs-pdf/, or null when the form has no separate instructions document
//              (any instructions are printed on the form itself)
// instructionsNote optional: one sentence for forms whose instructions are shared with other forms
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
    instructionsNote: "These are the Form 1040 instructions, which cover Form 1040-SR too.",
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

  {
    id: "8888",
    number: "Form 8888",
    title: "Allocation of Refund",
    group: "filing",
    kind: "you-file",
    summary: "Splits your federal refund among more than one account, such as checking, savings or an IRA, instead of sending it all to one.",
    whoUses: "Anyone who wants to divide a refund between accounts.",
    when: "Filed with your Form 1040.",
    keywords: ["refund", "split refund", "direct deposit", "savings", "ira", "multiple accounts"],
    pdf: "f8888.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-8888",
  },

  /* ------------------------------ Credits, deductions & adjustments ------------------------------ */
  {
    id: "schedule-1",
    number: "Schedule 1 (Form 1040)",
    title: "Additional Income and Adjustments to Income",
    group: "credits",
    kind: "you-file",
    summary: "Reports income that has no line of its own on Form 1040, such as business income or unemployment, and adjustments that reduce your taxable income, such as student loan interest.",
    whoUses: "Anyone with income or adjustments that don't fit on the main Form 1040.",
    when: "Filed with your Form 1040. The Form 1040 instructions tell you whether you need it.",
    keywords: ["adjustments", "additional income", "student loan interest", "hsa", "unemployment", "educator expenses", "other income"],
    pdf: "f1040s1.pdf",
    instructions: "i1040gi.pdf",
    instructionsNote: "Schedule 1 is explained inside the Form 1040 instructions.",
    page: "about-form-1040", // the IRS covers the 1040 schedules from its Form 1040 page
  },
  {
    id: "schedule-8812",
    number: "Schedule 8812 (Form 1040)",
    title: "Credits for Qualifying Children and Other Dependents",
    group: "credits",
    kind: "you-file",
    summary: "Figures the child tax credit and the credit for other dependents, which reduce the tax you owe when you support a qualifying child or other dependent.",
    whoUses: "Parents and others who support a qualifying child or other dependent.",
    when: "Filed with your Form 1040.",
    keywords: ["child tax credit", "kids", "children", "dependents", "dependent", "parent", "8812"],
    pdf: "f1040s8.pdf",
    instructions: "i1040s8.pdf",
    page: "about-schedule-8812-form-1040",
  },
  {
    id: "2441",
    number: "Form 2441",
    title: "Child and Dependent Care Expenses",
    group: "credits",
    kind: "you-file",
    summary: "Claims a credit for part of what you paid for care of a child or other dependent so you could work or look for work.",
    whoUses: "Parents and caregivers who paid for that care while they worked or looked for work.",
    when: "Filed with your Form 1040.",
    keywords: ["child care", "daycare", "babysitter", "dependent care", "nanny", "after school", "kids"],
    pdf: "f2441.pdf",
    instructions: "i2441.pdf",
    page: "about-form-2441",
  },
  {
    id: "8863",
    number: "Form 8863",
    title: "Education Credits (American Opportunity and Lifetime Learning Credits)",
    group: "credits",
    kind: "you-file",
    summary: "Claims a tax credit for tuition and related costs of college or other higher education.",
    whoUses: "Students, and the people who claim them as dependents, who paid higher-education costs.",
    when: "Filed with your Form 1040. The school's Form 1098-T helps you fill it in.",
    keywords: ["college", "tuition", "student", "school", "education credit", "aotc", "llc", "university"],
    pdf: "f8863.pdf",
    instructions: "i8863.pdf",
    page: "about-form-8863",
  },
  {
    id: "8829",
    number: "Form 8829",
    title: "Expenses for Business Use of Your Home",
    group: "credits",
    kind: "you-file",
    summary: "Works out the part of your home costs, such as rent, utilities and mortgage interest, that you can deduct because you use part of your home regularly and exclusively for business.",
    whoUses: "Self-employed people who work from home.",
    when: "Filed with Schedule C. The IRS also offers a simplified method that doesn't use this form; the instructions explain it.",
    keywords: ["home office", "work from home", "remote", "self-employed", "rent", "utilities", "freelance"],
    pdf: "f8829.pdf",
    instructions: "i8829.pdf",
    page: "about-form-8829",
  },
  {
    id: "8606",
    number: "Form 8606",
    title: "Nondeductible IRAs",
    group: "credits",
    kind: "you-file",
    summary: "Tracks IRA contributions you've already paid tax on and reports Roth IRA conversions, so you aren't taxed on the same money twice.",
    whoUses: "People who made nondeductible contributions to a traditional IRA, or moved money from a traditional IRA to a Roth IRA.",
    when: "Filed with your Form 1040 for the year it applies.",
    keywords: ["ira", "roth", "conversion", "backdoor roth", "nondeductible", "basis", "retirement"],
    pdf: "f8606.pdf",
    instructions: "i8606.pdf",
    page: "about-form-8606",
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
    group: "statements",
    kind: "you-receive",
    summary: "Your employer's yearly report of what they paid you and how much tax they withheld. You use it to fill in your return.",
    whoUses: "Employees. Your employer prepares it and sends it to you.",
    when: "Sent to you early in the year, ahead of tax filing season. Contact your employer if you don't get yours.",
    keywords: ["wages", "employer", "withholding", "paycheck", "salary", "job"],
    pdf: "fw2.pdf",
    instructions: "iw2w3.pdf",
    instructionsNote: "These instructions cover Forms W-2 and W-3 together.",
    page: "about-form-w-2",
  },
  {
    id: "1099-nec",
    number: "Form 1099-NEC",
    title: "Nonemployee Compensation",
    group: "statements",
    kind: "you-receive",
    summary: "Reports business income paid to you as a freelancer or contractor rather than as an employee.",
    whoUses: "Freelancers, contractors and gig workers. The business that paid you prepares it.",
    when: "Sent to you early in the year when a client's payments to you are large enough to require reporting.",
    keywords: ["freelance", "contractor", "gig", "self-employed", "1099", "side hustle"],
    pdf: "f1099nec.pdf",
    instructions: "i1099mec.pdf",
    instructionsNote: "These instructions cover Forms 1099-MISC and 1099-NEC together.",
    page: "about-form-1099-nec",
  },
  {
    id: "1099-k",
    number: "Form 1099-K",
    title: "Payment Card and Third Party Network Transactions",
    group: "statements",
    kind: "you-receive",
    summary: "Reports payments you received through card processors, payment apps or online marketplaces for goods or services.",
    whoUses: "Sellers, freelancers and small businesses paid through payment apps, card readers or marketplaces. The payment company prepares it.",
    when: "Sent to you early in the year if the payment company is required to report your payments. It shows gross payments, so check it against your own records; the IRS page explains what to do if something on it isn't income.",
    keywords: ["payment app", "marketplace", "online sales", "side hustle", "gig", "credit card payments", "venmo", "paypal", "etsy", "ebay"],
    pdf: "f1099k.pdf",
    instructions: "i1099k.pdf",
    page: "about-form-1099-k",
  },
  {
    id: "1099-misc",
    number: "Form 1099-MISC",
    title: "Miscellaneous Information",
    group: "statements",
    kind: "you-receive",
    summary: "Reports other kinds of income paid to you outside of a job, such as rent, royalties, prizes and awards.",
    whoUses: "Landlords, creators, prize winners and others who received these kinds of payments. The payer prepares it.",
    when: "Sent to you early in the year by the payer.",
    keywords: ["rent", "royalties", "prizes", "awards", "other income", "landlord", "1099"],
    pdf: "f1099msc.pdf",
    instructions: "i1099mec.pdf",
    instructionsNote: "These instructions cover Forms 1099-MISC and 1099-NEC together.",
    page: "about-form-1099-misc",
  },
  {
    id: "1099-int",
    number: "Form 1099-INT",
    title: "Interest Income",
    group: "statements",
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
    group: "statements",
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
    group: "statements",
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
    group: "statements",
    kind: "you-receive",
    summary: "Reports money paid out to you from a retirement account or pension, such as an IRA, 401(k) or annuity.",
    whoUses: "Anyone who took a payout, withdrawal or rollover from a retirement plan.",
    when: "Sent to you early in the year by the plan or account provider.",
    keywords: ["retirement", "ira", "401k", "pension", "rollover", "withdrawal", "annuity"],
    pdf: "f1099r.pdf",
    instructions: "i1099r.pdf",
    instructionsNote: "These instructions cover Forms 1099-R and 5498 together.",
    page: "about-form-1099-r",
  },
  {
    id: "1099-g",
    number: "Form 1099-G",
    title: "Certain Government Payments",
    group: "statements",
    kind: "you-receive",
    summary: "Reports unemployment benefits and certain other government payments, including state or local tax refunds, paid to you.",
    whoUses: "People who received unemployment compensation or a state or local income tax refund. The government agency prepares it.",
    when: "Sent to you early in the year by the agency that paid you.",
    keywords: ["unemployment", "state refund", "tax refund", "jobless", "benefits", "government"],
    pdf: "f1099g.pdf",
    instructions: "i1099g.pdf",
    page: "about-form-1099-g",
  },
  {
    id: "1098",
    number: "Form 1098",
    title: "Mortgage Interest Statement",
    group: "statements",
    kind: "you-receive",
    summary: "Reports the mortgage interest you paid during the year. You use it if you itemize your deductions.",
    whoUses: "Homeowners with a mortgage. Your lender prepares it.",
    when: "Sent to you early in the year by your mortgage lender.",
    keywords: ["mortgage", "home", "interest", "homeowner", "lender", "itemize", "house"],
    pdf: "f1098.pdf",
    instructions: "i1098.pdf",
    page: "about-form-1098",
  },
  {
    id: "1098-t",
    number: "Form 1098-T",
    title: "Tuition Statement",
    group: "statements",
    kind: "you-receive",
    summary: "Reports tuition and related amounts a college or other school received or billed for you. You use it when claiming education credits.",
    whoUses: "Students at colleges and other schools, or the people who claim them. The school prepares it.",
    when: "Sent to you early in the year by the school. Contact the school if you think you should have received one.",
    keywords: ["student", "college", "tuition", "school", "university", "education"],
    pdf: "f1098t.pdf",
    instructions: "i1098et.pdf",
    instructionsNote: "These instructions cover Forms 1098-E and 1098-T together.",
    page: "about-form-1098-t",
  },
  {
    id: "5498",
    number: "Form 5498",
    title: "IRA Contribution Information",
    group: "statements",
    kind: "you-receive",
    summary: "Reports contributions, rollovers and conversions for an IRA, plus its value at the end of the year, as reported by the account provider.",
    whoUses: "Anyone with an IRA. The account provider prepares it; you don't file it.",
    when: "Often arrives later than other tax forms, because IRA contributions for a year can be made after the year ends.",
    keywords: ["ira", "roth", "contributions", "rollover", "retirement", "conversion"],
    pdf: "f5498.pdf",
    instructions: "i1099r.pdf",
    instructionsNote: "These instructions cover Forms 1099-R and 5498 together.",
    page: "about-form-5498",
  },

  /* ------------------------------ Paying what you owe ------------------------------ */
  {
    id: "9465",
    number: "Form 9465",
    title: "Installment Agreement Request",
    group: "owing",
    kind: "you-file",
    summary: "Asks the IRS to let you pay the tax you owe in monthly payments instead of all at once.",
    whoUses: "People who owe tax and can't pay the full amount right now.",
    when: "After you file your return, or with it. The IRS page also describes applying online.",
    keywords: ["payment plan", "installment", "owe", "can't pay", "monthly payments", "balance due", "debt"],
    pdf: "f9465.pdf",
    instructions: "i9465.pdf",
    page: "about-form-9465",
  },
  {
    id: "1040-v",
    number: "Form 1040-V",
    title: "Payment Voucher",
    group: "owing",
    kind: "you-file",
    summary: "A coupon that goes in the envelope with a check or money order when you mail a payment to the IRS, so it's credited correctly.",
    whoUses: "Anyone who owes tax and pays by mail instead of paying electronically.",
    when: "Sent with your payment. You don't need it if you pay online or electronically.",
    keywords: ["voucher", "pay by check", "mail payment", "money order", "balance due", "owe"],
    pdf: "f1040v.pdf",
    instructions: null, // no separate instructions document
    page: "about-form-1040-v",
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
  {
    id: "4506",
    number: "Form 4506",
    title: "Request for Copy of Tax Return",
    group: "records",
    kind: "you-file",
    summary: "Asks the IRS for a complete copy of a return you filed in the past. A transcript (Form 4506-T) is only a summary.",
    whoUses: "Anyone who needs an exact copy of an old return, for example for a loan or legal matter.",
    when: "Whenever you need one. The IRS page covers current fees and timing.",
    keywords: ["copy of return", "old return", "lost return", "past return", "mortgage", "loan"],
    pdf: "f4506.pdf",
    instructions: null, // the instructions are included in the form
    page: "about-form-4506",
  },
  {
    id: "8821",
    number: "Form 8821",
    title: "Tax Information Authorization",
    group: "records",
    kind: "you-file",
    summary: "Lets you authorize someone, such as a tax preparer or family member, to receive and look at your tax information from the IRS. It doesn't let them act or speak for you.",
    whoUses: "Anyone who wants another person to see their IRS records or notices.",
    when: "Whenever you want to give that permission. You choose which forms and years it covers.",
    keywords: ["authorize", "preparer", "accountant", "cpa", "share", "third party", "permission"],
    pdf: "f8821.pdf",
    instructions: "i8821.pdf",
    page: "about-form-8821",
  },
  {
    id: "w-7",
    number: "Form W-7",
    title: "Application for IRS Individual Taxpayer Identification Number",
    group: "records",
    kind: "you-file",
    summary: "Applies for an ITIN, a nine-digit tax ID for people who must file or appear on a tax return but can't get a Social Security number.",
    whoUses: "People, including some spouses and dependents, who need a taxpayer ID but aren't eligible for a Social Security number.",
    when: "Usually submitted with a federal tax return unless an exception applies. The IRS page lists the exceptions and the identity documents it accepts.",
    keywords: ["itin", "taxpayer id", "no ssn", "immigrant", "foreign", "nonresident", "dependent"],
    pdf: "fw7.pdf",
    instructions: "iw7.pdf",
    page: "about-form-w-7",
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

export const getTaxForm = (id) => TAX_FORMS.find((f) => f.id === id) || null;

// Search, then keep only one kind of form ("all" keeps everything).
export function filterTaxForms(query, kind = "all", forms = TAX_FORMS) {
  const found = searchTaxForms(query, forms);
  return kind === "all" ? found : found.filter((f) => f.kind === kind);
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
