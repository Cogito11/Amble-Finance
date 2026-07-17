export const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
];

export const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);

// Set once per render from the top-level App component (based on the user's saved
// preference) before any child component runs, so every fmt() call anywhere in the
// tree, no matter how deep, picks up the current currency without prop drilling.
//
// This is a plain module-level variable rather than React context so that fmt()
// can be called from anywhere - including plain helper functions - without every
// caller needing to be a component that can consume context. It's kept private to
// this module (not exported) since ES module imports are read-only live bindings:
// another file can't reassign an imported variable directly, so callers go through
// setActiveCurrency() below instead.
let ACTIVE_CURRENCY = "USD";

// The only supported way to change the active currency from outside this module.
// Call this once per render from App, before any descendant renders, so every
// fmt() call in the tree picks up the new currency.
export function setActiveCurrency(code) {
  ACTIVE_CURRENCY = code || "USD";
}

export const fmt = (n) => {
  const v = Number(n) || 0;
  const digits = ZERO_DECIMAL_CURRENCIES.has(ACTIVE_CURRENCY) ? 0 : 2;
  try {
    return v.toLocaleString("en-US", { style: "currency", currency: ACTIVE_CURRENCY, maximumFractionDigits: digits, minimumFractionDigits: digits });
  } catch (e) {
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }
};

// Formats a whole number of months as "Xy Ym" / "X months" for payoff timelines.
export const fmtMonths = (months) => {
  const m = Math.max(0, Math.round(Number(months) || 0));
  const years = Math.floor(m / 12);
  const rem = m % 12;
  if (years === 0) return `${rem} ${rem === 1 ? "month" : "months"}`;
  if (rem === 0) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years}${years === 1 ? "yr" : "yrs"} ${rem}mo`;
};

export const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmtDateTime = (iso) => {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return "Never";
  }
};

export const formatBytes = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB"];
  let val = b / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(1)} ${units[i]}`;
};
