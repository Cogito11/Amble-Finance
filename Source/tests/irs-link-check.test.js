import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLink } from "../tests-network/check-link";

// The weekly IRS link check can't run in the normal suite (it needs the internet), so this proves its
// verdicts are right by feeding it fake responses.

const PDF = { kind: "pdf", url: "https://www.irs.gov/pub/irs-pdf/f1040.pdf" };
const PAGE = { kind: "page", url: "https://www.irs.gov/forms-pubs/about-form-1040" };

const response = ({ status = 200, type = "application/pdf", url } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? type : null) },
  body: null,
});

// Each call to fetch gets the next queued answer; an Error means the request itself failed.
function queueFetch(...answers) {
  const fn = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("checkLink", () => {
  it("a PDF link that answers with a PDF is ok", async () => {
    queueFetch(response());
    expect(await checkLink(PDF)).toMatchObject({ verdict: "ok" });
  });

  it("a page link is ok whatever its content type, and needn't be a PDF", async () => {
    queueFetch(response({ type: "text/html; charset=utf-8" }));
    expect(await checkLink(PAGE)).toMatchObject({ verdict: "ok" });
  });

  it("404 and 410 are dead", async () => {
    queueFetch(response({ status: 404 }));
    expect(await checkLink(PDF)).toEqual({ verdict: "dead", detail: "HTTP 404" });
    queueFetch(response({ status: 410 }));
    expect(await checkLink(PAGE)).toEqual({ verdict: "dead", detail: "HTTP 410" });
  });

  it("a PDF link that now serves an HTML page is dead (a soft 404)", async () => {
    queueFetch(response({ type: "text/html" }));
    const result = await checkLink(PDF);
    expect(result.verdict).toBe("dead");
    expect(result.detail).toContain("expected a PDF");
  });

  it("a redirect off irs.gov is dead", async () => {
    queueFetch(response({ url: "https://example.com/f1040.pdf" }));
    const result = await checkLink(PDF);
    expect(result.verdict).toBe("dead");
    expect(result.detail).toContain("example.com");
  });

  it("a redirect to another irs.gov host is fine", async () => {
    queueFetch(response({ url: "https://www.stayexempt.irs.gov/pub/irs-pdf/f1040.pdf" }));
    expect(await checkLink(PDF)).toMatchObject({ verdict: "ok" });
  });

  it("retries with GET when the server refuses HEAD, and trusts the GET", async () => {
    const fetchMock = queueFetch(response({ status: 405 }), response());
    expect(await checkLink(PDF)).toMatchObject({ verdict: "ok" });
    expect(fetchMock.mock.calls.map((c) => c[1].method)).toEqual(["HEAD", "GET"]);
  });

  it("a blocked request (403 on both) is unverified, not dead", async () => {
    queueFetch(response({ status: 403 }));
    expect(await checkLink(PDF)).toEqual({ verdict: "unverified", detail: "HTTP 403" });
  });

  it("a server error or rate limit is unverified, not dead", async () => {
    queueFetch(response({ status: 503 }));
    expect(await checkLink(PAGE)).toMatchObject({ verdict: "unverified" });
    queueFetch(response({ status: 429 }));
    expect(await checkLink(PAGE)).toMatchObject({ verdict: "unverified" });
  });

  it("no response at all (offline, DNS failure, timeout) is unverified, not dead", async () => {
    const err = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    queueFetch(err);
    expect(await checkLink(PDF)).toEqual({ verdict: "unverified", detail: "no response (ENOTFOUND)" });
  });
});
