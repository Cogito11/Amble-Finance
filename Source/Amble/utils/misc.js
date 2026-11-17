export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Combines a saved sidebar order with the sections the current version offers. Saved sections keep their
// place and any that no longer exist are dropped. A section the person has never seen (added in a newer
// version) goes just above "More" when "More" is still last, rather than below it, and at the end otherwise.
export const mergeSidebarOrder = (savedOrder, defaultOrder) => {
  const kept = savedOrder.filter((id) => defaultOrder.includes(id));
  const added = defaultOrder.filter((id) => !savedOrder.includes(id));
  if (kept.length && kept[kept.length - 1] === "more") return [...kept.slice(0, -1), ...added, "more"];
  return [...kept, ...added];
};

// Snaps a money value to whole cents. Re-exported from money.js, which holds all the
// cent-based money helpers (see there for why floating point can't be trusted).
export { roundMoney } from "./money";

// Number inputs change their value when the user scrolls over them while focused,
// which is an easy way to accidentally mangle an amount. Blurring on wheel stops
// the browser's default "scroll to change value" behavior for that field while
// still letting the scroll gesture itself pass through to scroll the page.
export const blurOnWheel = (e) => e.target.blur();

// Used to keep global keyboard shortcuts from firing while the user is typing
// somewhere - e.g. pressing "1" while entering an amount, or "?" while typing
// "what?" into a description field, shouldn't trigger a shortcut.
export const isTypingTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el.isContentEditable;
};

// Sorts transactions newest first. Sorting on `date` alone leaves same-day
// transactions in whatever order they happened to already be in, so a transaction
// just added for today (or any date shared with existing entries) could land
// underneath older same-day entries instead of on top. Breaking ties by each
// transaction's position in the list (transactions are appended when created)
// puts the most recently created entry first within its date.
export function sortTransactionsNewestFirst(list) {
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => String(b.t.date ?? "").localeCompare(String(a.t.date ?? "")) || b.i - a.i)
    .map(({ t }) => t);
}
