import { useState, useEffect, useMemo } from "react";
import { fmt } from "../utils/format";
import { blurOnWheel } from "../utils/misc";

// Backs a number field that can optionally pull its value from one of the
// user's real accounts instead of being typed in manually. Returns a small
// toggle (meant for a card's top-right corner) plus the field body, so the
// toggle isn't forced to live next to the label where it crowds the layout.
// Credit cards are excluded since their balance represents debt, not savings.
export function useAccountAmountField({ value, onChange, accounts, balances }) {
  const [mode, setMode] = useState("manual");
  const [accountId, setAccountId] = useState("");
  const savingsAccounts = useMemo(() => (accounts || []).filter((a) => a.type !== "credit"), [accounts]);
  const selectedAccount = savingsAccounts.find((a) => a.id === accountId) || null;
  const selectedBalance = accountId ? balances?.[accountId] : undefined;

  useEffect(() => {
    if (mode === "account" && accountId && selectedBalance !== undefined) {
      onChange(Math.max(0, Math.round(selectedBalance * 100) / 100));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accountId, selectedBalance]);

  const toggle = savingsAccounts.length > 0 && (
    <div className="seg card-corner-seg" role="group" aria-label="Value source">
      <button type="button" className={`seg-btn ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>Manual</button>
      <button type="button" className={`seg-btn ${mode === "account" ? "active" : ""}`} onClick={() => setMode("account")}>From account</button>
    </div>
  );

  const field = mode === "account" && savingsAccounts.length > 0 ? (
    <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
      <option value="">Select an account…</option>
      {savingsAccounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name} · {fmt(balances?.[a.id])}</option>
      ))}
    </select>
  ) : (
    <input className="input" type="number" min="0" step="10" value={value} onWheel={blurOnWheel} onChange={(e) => onChange(e.target.value)} />
  );

  return { toggle, field, mode, accountId, selectedAccount };
}
