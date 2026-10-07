import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for the floating-point money bug. Adding dollar amounts with
// plain `+` leaves crumbs (0.1 + 0.2 !== 0.3) that surfaced as "$0.00 debt" shown in
// red and goals that never completed. All money sums must go through utils/money.js
// (sumMoney / sumMoneyBy / roundMoney / toCents). This test scans the source and
// fails if a raw sum of an amount-like field is reintroduced.

const SRC = join(__dirname, "..", "Amble");

const RAW_MONEY_SUM_PATTERNS = [
  { name: "reduce adding .amount/.spent/.allocated/.targetAmount/.startingBalance", re: /reduce\(.*=>\s*\w+\s*\+\s*\(?\s*\w+\.(?:amount|spent|allocated|targetAmount|startingBalance)\b/ },
  { name: "reduce adding balances[...]", re: /reduce\(.*=>\s*\w+\s*\+\s*\(?\s*balances\??\.?\[/ },
  { name: "+= on an amount field", re: /\+=\s*\w+\.(?:amount|spent|allocated)\b/ },
  { name: "-= on an amount field", re: /-=\s*\w+\.(?:amount|spent|allocated)\b/ },
  { name: "(x || 0) + something.amount", re: /\|\|\s*0\)\s*\+\s*\w+\.amount\b/ },
  { name: "(g.manualAmount || 0) + amount (goal contributions)", re: /manualAmount\s*\|\|\s*0\)\s*\+/ },
];

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(js|jsx)$/.test(name) ? [full] : [];
  });
}

// Lines that are *meant* to do raw arithmetic. Each needs a reason.
const ALLOWED = [
  // utils/money.js is where the cent arithmetic itself lives.
  { file: "utils/money.js", reason: "implements the cent helpers" },
];

describe("money guard", () => {
  it("catches the patterns it is meant to catch (self-test)", () => {
    const bad = [
      "const t = list.reduce((s, t) => s + t.amount, 0);",
      "accounts.reduce((s, a) => s + balances[a.id], 0)",
      "total += bill.amount || 0;",
      "balance -= t.amount;",
      "byMonth[mk] = (byMonth[mk] || 0) + t.amount;",
      "? { ...g, manualAmount: (g.manualAmount || 0) + amount }",
    ];
    for (const line of bad) {
      expect(RAW_MONEY_SUM_PATTERNS.some((p) => p.re.test(line)), line).toBe(true);
    }
    const good = [
      "const t = sumMoneyBy(list, (t) => t.amount);",
      "byMonth[mk] = roundMoney((byMonth[mk] || 0) + t.amount);",
      "cents += toCents(t.amount);",
    ];
    for (const line of good) {
      // roundMoney(...) wrapped accumulation is intentionally fine, so it must not trip the plain-sum rule
      if (line.includes("roundMoney")) continue;
      expect(RAW_MONEY_SUM_PATTERNS.some((p) => p.re.test(line)), line).toBe(false);
    }
  });

  it("no raw floating-point money sums exist in the app source", () => {
    const offenders = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (ALLOWED.some((a) => a.file === rel)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (line.trim().startsWith("//")) return;
        // An accumulation already wrapped in roundMoney(...) is exact to the cent.
        if (/roundMoney\(/.test(line)) return;
        for (const p of RAW_MONEY_SUM_PATTERNS) {
          if (p.re.test(line)) offenders.push(`${rel}:${i + 1}  [${p.name}]  ${line.trim()}`);
        }
      });
    }
    expect(offenders, "Use sumMoney/sumMoneyBy/roundMoney from utils/money.js instead:\n" + offenders.join("\n")).toEqual([]);
  });
});
