import { APP_INFO } from "../constants";

// Pulled from APP_INFO.githubUrl rather than duplicated as its own constant,
// so there's a single source of truth for "which repo" - same reasoning as
// everywhere else in this file that keys off APP_INFO.
function repoSlug() {
  const match = (APP_INFO.githubUrl || "").match(/github\.com\/([^/]+\/[^/]+?)\/?$/);
  return match ? match[1] : null;
}

// Plain dot-separated numeric comparison (1.2.10 > 1.2.9, etc.) - good enough
// for this app's own tag scheme (vX.Y.Z via package.json) without pulling in
// a semver library just to compare three integers.
export function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const toParts = (v) => String(v).split(".").map((p) => parseInt(p, 10) || 0);
  const a = toParts(latest);
  const b = toParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Mirrors the error-reason handling the marketing site's own release-check
// script uses (see index.html) - "no-release" / "rate-limited" / "fetch-failed" -
// so callers can show the same kind of specific, honest message instead of a
// generic "something went wrong".
async function fetchLatestRelease() {
  const repo = repoSlug();
  if (!repo) throw new Error("fetch-failed");

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
  if (res.status === 404) throw new Error("no-release");
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("X-RateLimit-Remaining");
    throw new Error(remaining === "0" || res.status === 429 ? "rate-limited" : "fetch-failed");
  }
  if (!res.ok) throw new Error("fetch-failed");

  const release = await res.json();
  return {
    version: (release.tag_name || "").replace(/^v/, ""),
    publishedAt: release.published_at || null,
  };
}

// Checks GitHub for the latest published release and reports whether it's
// newer than the version currently running. Throws on failure (no release
// published yet, rate-limited, or a plain network/fetch error) - callers
// decide how to surface that (silently for the background/toast check,
// visibly for the manual "Check for update" button).
export async function checkForUpdate() {
  const release = await fetchLatestRelease();
  return {
    hasUpdate: isNewerVersion(release.version, APP_INFO.version),
    latestVersion: release.version,
    publishedAt: release.publishedAt,
  };
}
