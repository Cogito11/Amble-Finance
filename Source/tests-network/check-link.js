// Decides whether one IRS link still works. Used by irs-links.test.js (which does the real requests) and
// by tests/irs-link-check.test.js (which feeds it fake responses to prove the verdicts are right).
//
// Returns { verdict: "ok" | "dead" | "unverified", detail }:
//   ok          the IRS answered and it looks right (a PDF for a PDF link; still on irs.gov)
//   dead        a definite problem: 404/410, an HTML page where a PDF should be, or a redirect off irs.gov
//   unverified  couldn't tell: the request was blocked (403/429), timed out, or the server errored

const USER_AGENT = "Mozilla/5.0 (compatible; AmbleLinkCheck/1.0; +https://github.com/Cogito11/Amble-Finance)";
const TIMEOUT_MS = 25_000;

function request(url, method) {
  return fetch(url, {
    method,
    redirect: "follow",
    headers: { "user-agent": USER_AGENT, accept: "*/*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function checkLink({ kind, url }) {
  let res;
  try {
    res = await request(url, "HEAD");
    // Some servers refuse HEAD; a GET tells us the truth.
    if (!res.ok && [400, 403, 405, 501].includes(res.status)) res = await request(url, "GET");
  } catch (err) {
    try {
      res = await request(url, "GET");
    } catch (err2) {
      const why = (err2.cause && err2.cause.code) || err2.name || "error";
      return { verdict: "unverified", detail: `no response (${why})` };
    }
  }

  // Drop any body we didn't ask for.
  if (res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {});

  if (res.status === 404 || res.status === 410) return { verdict: "dead", detail: `HTTP ${res.status}` };
  if (!res.ok) return { verdict: "unverified", detail: `HTTP ${res.status}` };

  const finalHost = new URL(res.url || url).hostname;
  if (!(finalHost === "irs.gov" || finalHost.endsWith(".irs.gov"))) {
    return { verdict: "dead", detail: `redirects off irs.gov to ${finalHost}` };
  }
  if (kind !== "page") {
    const type = (res.headers && res.headers.get("content-type")) || "";
    if (!/pdf|octet-stream/i.test(type)) return { verdict: "dead", detail: `expected a PDF but got "${type || "no content type"}"` };
  }
  return { verdict: "ok", detail: `HTTP ${res.status}` };
}
