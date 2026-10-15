import React, { useState } from "react";
import { Download, RefreshCw, Check } from "lucide-react";
import { APP_INFO } from "../../constants";
import { checkForUpdate } from "../../utils/updates";
import { useUpdater } from "../../hooks/useUpdater";

// ---- The "Updates" row in More > About -------------------------------------------------------------

// Installs that can update themselves get the real flow: check, download in place, restart.
function InPlaceUpdates({ updater }) {
  const { state, check, download, install } = updater;
  const { status, version, percent, error } = state;

  if (status === "available") {
    return (
      <button className="btn btn-primary btn-sm" onClick={download} title={error ? error.message : undefined}>
        <Download size={13} /> {error ? "Retry download" : `Download v${version}`}
      </button>
    );
  }
  if (status === "downloading") {
    return <span className="muted">Downloading v{version}… {percent ?? 0}%</span>;
  }
  if (status === "downloaded") {
    return (
      <button className="btn btn-primary btn-sm" onClick={install} title={error ? error.message : "Amble will restart to finish updating."}>
        <RefreshCw size={13} /> Restart to update to v{version}
      </button>
    );
  }

  const checking = status === "checking";
  const title = checking ? "Checking for updates…"
    : status === "current" ? `You're on the latest version (v${state.currentVersion}).`
      : status === "error" && error ? error.message
        : "Check GitHub for a newer release of Amble.";
  return (
    <button className="btn btn-ghost btn-sm" onClick={check} disabled={checking} title={title}>
      {status === "current" ? <Check size={13} /> : <RefreshCw size={13} className={checking ? "spin" : ""} />}
      {" "}{checking ? "Checking…" : status === "current" ? "Up to date" : status === "error" ? "Check failed" : "Check for update"}
    </button>
  );
}

// Everything else (a browser build, the portable .exe, a Mac build that isn't signed yet, ...) can't
// replace itself, so it keeps the original behaviour: look on GitHub, then link to the download page.
// Unlike the background check, this always hits GitHub live since it's a one-off click.
function ManualUpdates() {
  const [updateCheck, setUpdateCheck] = useState({ status: "idle" }); // idle | checking | current | available | error
  const handleCheckForUpdate = async () => {
    setUpdateCheck({ status: "checking" });
    try {
      const result = await checkForUpdate();
      setUpdateCheck(result.hasUpdate ? { status: "available", version: result.latestVersion } : { status: "current" });
    } catch (e) {
      setUpdateCheck({ status: "error", reason: e && e.message });
    }
  };
  const updateCheckMessage = {
    idle: "Check GitHub for a newer release of Amble.",
    checking: "Checking for updates…",
    current: `You're on the latest version (v${APP_INFO.version}).`,
    available: `A newer version (v${updateCheck.version}) is available.`,
    error: updateCheck.reason === "no-release"
      ? "No published release found on GitHub."
      : updateCheck.reason === "rate-limited"
        ? "GitHub's API rate limit was hit. Try again in a few minutes."
        : "Couldn't check for updates right now.",
  }[updateCheck.status];

  return updateCheck.status === "available" ? (
    <a className="btn btn-primary btn-sm" href={APP_INFO.downloadUrl} target="_blank" rel="noreferrer">
      <Download size={13} /> Download v{updateCheck.version}
    </a>
  ) : (
    <button className="btn btn-ghost btn-sm" onClick={handleCheckForUpdate} disabled={updateCheck.status === "checking"} title={updateCheckMessage}>
      {updateCheck.status === "current" ? <Check size={13} /> : <RefreshCw size={13} className={updateCheck.status === "checking" ? "spin" : ""} />}
      {" "}{updateCheck.status === "checking" ? "Checking…" : updateCheck.status === "current" ? "Up to date" : updateCheck.status === "error" ? "Check failed" : "Check for update"}
    </button>
  );
}

export function UpdatesRow() {
  const updater = useUpdater();
  return updater.supported ? <InPlaceUpdates updater={updater} /> : <ManualUpdates />;
}

// ---- The notice at the top of the main window -------------------------------------------------------

const bannerStyle = { margin: "12px 24px 0", display: "flex", alignItems: "center", gap: 10 };

// Appears only when this install can update itself AND there's something to act on. A failed
// background check never shows here (the main process keeps those quiet).
export function UpdateBanner() {
  const { supported, state, download, install } = useUpdater();
  const [dismissedKey, setDismissedKey] = useState(null);

  if (!supported || !state) return null;
  const { status, version, percent, error } = state;
  if (status !== "available" && status !== "downloading" && status !== "downloaded") return null;

  // Dismissing hides this particular notice only; a new state (download finished, an error) shows again.
  const key = `${status}:${version}:${error ? error.phase : ""}`;
  if (dismissedKey === key) return null;
  const later = <button className="btn btn-ghost btn-sm" onClick={() => setDismissedKey(key)}>{error ? "Dismiss" : "Later"}</button>;
  const manual = <a className="btn btn-ghost btn-sm" href={APP_INFO.downloadUrl} target="_blank" rel="noreferrer">Download manually</a>;

  if (error) {
    const retry = status === "downloaded" ? install : download;
    return (
      <div className="inline-error" role="status" style={bannerStyle}>
        <span style={{ flex: 1 }}>
          Amble v{version} couldn't be {status === "downloaded" ? "installed" : "downloaded"}: {error.message}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={retry}>Try again</button>
        {manual}
        {later}
      </div>
    );
  }

  if (status === "downloading") {
    return (
      <div className="recovery-ok" role="status" style={bannerStyle}>
        <span style={{ flex: 1 }}>Downloading Amble v{version}… {percent ?? 0}%</span>
      </div>
    );
  }

  if (status === "downloaded") {
    return (
      <div className="recovery-ok" role="status" style={bannerStyle}>
        <span style={{ flex: 1 }}>
          Amble v{version} is ready to install. Amble will restart to finish updating, and your data stays where it is.
          If you'd rather wait, it installs the next time you close Amble.
        </span>
        <button className="btn btn-primary btn-sm" onClick={install}>Restart now</button>
        {later}
      </div>
    );
  }

  return (
    <div className="recovery-ok" role="status" style={bannerStyle}>
      <span style={{ flex: 1 }}>Amble v{version} is available.</span>
      <button className="btn btn-primary btn-sm" onClick={download}><Download size={13} /> Download update</button>
      {later}
    </div>
  );
}
