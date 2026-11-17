import { describe, expect, it } from "vitest";
import { allCatalogLinks } from "../Amble/data/taxForms";
import { checkLink } from "./check-link";

// Requests every IRS link the Taxes tab can open and reports the ones that no longer resolve.
//
// Run it with `npm run check:irs-links` (it needs internet). It is deliberately NOT part of `npm test`:
// the normal suite has to pass offline and shouldn't fail because irs.gov is slow. GitHub Actions runs it
// on demand (.github/workflows/irs-links.yml, started by hand from the Actions tab). How each link is judged lives in check-link.js.
//
// "dead" links fail the run. "unverified" ones (blocked, timed out, server error) only warn, so a temporary
// hiccup or a firewall doesn't cry wolf. The run still fails if nothing at all could be verified, because
// a pass would then mean nothing.

const PAUSE_MS = 200; // be polite to irs.gov
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("IRS links used by the Taxes tab", () => {
  it("none of them are dead", async () => {
    const links = allCatalogLinks();
    const dead = [];
    const unverified = [];
    let ok = 0;

    for (const link of links) {
      const { verdict, detail } = await checkLink(link);
      const line = `${link.form} (${link.kind}): ${detail}\n    ${link.url}`;
      if (verdict === "ok") ok += 1;
      else if (verdict === "dead") dead.push(line);
      else unverified.push(line);
      await sleep(PAUSE_MS);
    }

    console.log(`IRS link check: ${ok} ok, ${dead.length} dead, ${unverified.length} unverified, of ${links.length}.`);
    if (unverified.length) console.warn(`Could not verify:\n  ${unverified.join("\n  ")}`);

    expect(dead, `Dead IRS links:\n  ${dead.join("\n  ")}`).toEqual([]);
    expect(ok, "None of the links could be verified, so this run proves nothing. Check your internet connection or whether irs.gov is blocking this network.").toBeGreaterThan(0);
  }, 600_000);
});
