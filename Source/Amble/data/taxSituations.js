// "Which of these describes your situation?" on the Taxes tab: everyday situations, each explained in
// plain language with the forms that go with it.
//
// Same rules as taxForms.js: no tax years, deadlines, thresholds or dollar amounts in the text (they
// change every year), and the IRS page linked from each form is where to find them. Forms are referenced
// by the ids in taxForms.js, and tax-situations.test.js fails if one doesn't exist.
//
// label    the button text, written the way a person would say it
// answer   2-4 plain sentences: which form does what, and what the person actually does
// forms    the forms to offer, in the order they'd be used. `role` is a few words on what it's for here.

export const TAX_SITUATIONS = [
  {
    id: "filing",
    label: "I'm filing my yearly tax return",
    answer:
      "Form 1040 is the main federal income tax return, and most people use it. Taxpayers 65 or older can choose the larger-print Form 1040-SR instead. If you have income or adjustments that don't fit on the main form, Schedule 1 covers them. Gather the W-2s and 1099s you received first, because you'll copy numbers from them.",
    forms: [
      { id: "1040", role: "Your main return" },
      { id: "1040-sr", role: "Larger-print version for age 65 and older" },
      { id: "schedule-1", role: "For extra income and adjustments" },
      { id: "w-2", role: "The wage statement you'll copy numbers from" },
    ],
  },
  {
    id: "new-job",
    label: "I just started a new job",
    answer:
      "Your employer will have you fill out Form W-4. It tells them how much federal income tax to hold back from each paycheck, which affects whether you owe or get a refund later. You give it to your employer; it isn't sent to the IRS. After the year ends they'll send you a Form W-2 showing what you earned and what was withheld.",
    forms: [
      { id: "w-4", role: "Fill out and give to your employer" },
      { id: "w-2", role: "What you'll receive afterward" },
    ],
  },
  {
    id: "freelance",
    label: "I freelance or do gig work",
    answer:
      "Clients may ask you for a Form W-9 so they can report what they pay you; you hand it to them. They report your pay on Form 1099-NEC, or you may get a Form 1099-K if a payment app or marketplace paid you. You report your income and expenses on Schedule C and the self-employment tax on Schedule SE, both filed with your Form 1040. Because no tax is withheld from this income, you may also need to make quarterly estimated payments with Form 1040-ES.",
    forms: [
      { id: "w-9", role: "Give to clients who ask for your taxpayer ID" },
      { id: "1099-nec", role: "What clients send you" },
      { id: "1099-k", role: "What payment apps and marketplaces send you" },
      { id: "schedule-c", role: "Report your income and expenses" },
      { id: "schedule-se", role: "Figure your self-employment tax" },
      { id: "1040-es", role: "Pay tax during the year" },
    ],
  },
  {
    id: "sold-investments",
    label: "I sold stocks, crypto or other investments",
    answer:
      "Your broker reports your sales on Form 1099-B. You list each sale on Form 8949, then Schedule D totals your gains and losses and carries the result to your Form 1040. Crypto sales are reported on Form 8949 as well, but which statement you receive depends on where you traded.",
    forms: [
      { id: "1099-b", role: "What your broker sends you" },
      { id: "8949", role: "List each sale" },
      { id: "schedule-d", role: "Total your gains and losses" },
    ],
  },
  {
    id: "interest-dividends",
    label: "I earned interest or dividends",
    answer:
      "Banks, brokerages and funds report what they paid you on Form 1099-INT (interest) and Form 1099-DIV (dividends). You don't file these yourself. You use them to fill out your Form 1040.",
    forms: [
      { id: "1099-int", role: "Reports interest" },
      { id: "1099-div", role: "Reports dividends" },
      { id: "1040", role: "Where you report them" },
    ],
  },
  {
    id: "retirement",
    label: "I have an IRA or retirement account",
    answer:
      "If you took money out, the account provider sends Form 1099-R showing what was paid and what type of payout it was, such as a rollover or early withdrawal. If you put money into an IRA, you'll receive Form 5498 showing your contributions. If you contributed money you didn't deduct, or converted a traditional IRA to a Roth, you also file Form 8606 to keep track of it.",
    forms: [
      { id: "1099-r", role: "Payouts from a retirement account" },
      { id: "5498", role: "Contributions to an IRA" },
      { id: "8606", role: "Nondeductible contributions and Roth conversions" },
    ],
  },
  {
    id: "extension",
    label: "I need more time to file my return",
    answer:
      "Form 4868 gives you extra time to file, but not extra time to pay. File it before the regular filing deadline, and pay what you expect to owe by then to limit penalties and interest.",
    forms: [
      { id: "4868", role: "Request the extension" },
      { id: "1040", role: "Your return, due by the extended deadline" },
    ],
  },
  {
    id: "cant-pay",
    label: "I owe tax and can't pay it all at once",
    answer:
      "Form 9465 asks the IRS to let you pay in monthly installments. It's still best to file your return on time even if you can't pay in full. If you pay by check or money order, include Form 1040-V with it. The IRS page also covers applying for a payment plan online.",
    forms: [
      { id: "9465", role: "Ask for a monthly payment plan" },
      { id: "1040-v", role: "Goes with a check or money order" },
    ],
  },
  {
    id: "mistake",
    label: "I made a mistake on a return I already filed",
    answer:
      "Form 1040-X corrects a return you've already filed, whether you left out income, missed a credit or got something else wrong. You list the corrected amounts and explain what changed. Check the IRS page for how long you have and how to submit it.",
    forms: [{ id: "1040-x", role: "Correct a filed return" }],
  },
  {
    id: "proof-of-income",
    label: "I need proof of income or a copy of an old return",
    answer:
      "Lenders and schools usually just want a transcript, which is a summary of your return or account. Form 4506-T requests one, and the IRS page also lists faster online options. If you need an exact copy of the return itself, Form 4506 requests that instead.",
    forms: [
      { id: "4506-t", role: "Request a transcript (a summary)" },
      { id: "4506", role: "Request a full copy of a return" },
    ],
  },
  {
    id: "moved",
    label: "I moved",
    answer: "Form 8822 tells the IRS your new mailing address so its notices and any mailed refund reach you.",
    forms: [{ id: "8822", role: "Update your address with the IRS" }],
  },
  {
    id: "college",
    label: "I'm paying for college",
    answer:
      "Your school sends Form 1098-T showing tuition and related amounts. You use it with Form 8863 to claim education credits that can reduce your tax. Which credit you qualify for depends on your situation, so check the Form 8863 instructions.",
    forms: [
      { id: "1098-t", role: "What your school sends you" },
      { id: "8863", role: "Claim education credits" },
    ],
  },
  {
    id: "kids",
    label: "I have kids or pay for child care",
    answer:
      "Schedule 8812 figures the child tax credit and the credit for other dependents. If you paid someone to care for a child or dependent so you could work or look for work, Form 2441 claims a credit for part of that cost. Both are filed with your Form 1040.",
    forms: [
      { id: "schedule-8812", role: "Child tax credit and credit for other dependents" },
      { id: "2441", role: "Credit for child and dependent care costs" },
    ],
  },
  {
    id: "home",
    label: "I own a home or work from home",
    answer:
      "Your mortgage lender sends Form 1098 showing the interest you paid, which you use if you itemize deductions. If you're self-employed and use part of your home regularly and exclusively for business, Form 8829 figures the home-office deduction. The IRS also describes a simpler method in the Schedule C instructions.",
    forms: [
      { id: "1098", role: "What your lender sends you" },
      { id: "8829", role: "Home-office deduction for the self-employed" },
    ],
  },
  {
    id: "unemployment",
    label: "I got unemployment or a state tax refund",
    answer:
      "The government agency that paid you sends Form 1099-G. You use it to fill out your tax return. Unemployment benefits are generally taxable income, and a state refund can be too, depending on your situation. The Form 1099-G page and instructions explain when.",
    forms: [
      { id: "1099-g", role: "What the agency sends you" },
      { id: "schedule-1", role: "Where this income is usually reported" },
    ],
  },
  {
    id: "split-refund",
    label: "I want my refund split between accounts",
    answer:
      "Form 8888 lets you divide your refund among more than one account instead of sending it all to one. You file it with your Form 1040.",
    forms: [{ id: "8888", role: "Choose where each part of your refund goes" }],
  },
  {
    id: "authorize",
    label: "Someone else helps with my taxes",
    answer:
      "Form 8821 authorizes someone, such as a tax preparer or family member, to receive and look at your IRS tax information. It doesn't let them speak or act for you; the IRS has a different form for that. You choose which forms and years it covers.",
    forms: [{ id: "8821", role: "Let someone see your IRS records" }],
  },
  {
    id: "itin",
    label: "I need a taxpayer ID but can't get a Social Security number",
    answer:
      "Form W-7 applies for an ITIN, a nine-digit taxpayer ID. It's usually submitted with a federal tax return. The IRS page lists the exceptions and which identity documents it accepts.",
    forms: [{ id: "w-7", role: "Apply for an ITIN" }],
  },
];

export const getTaxSituation = (id) => TAX_SITUATIONS.find((s) => s.id === id) || null;
