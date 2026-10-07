import React, { useEffect, useRef, useState } from "react";
import { BackupList } from "./BackupList";
import { CSS } from "../../styles/theme";
import { THEME_KEY } from "../../constants";
import { downloadTextFile, exportRawData, restoreFromBackupText, startFresh } from "../../state/recovery";
import { describeReport } from "../../state/validate";
import { todayStr } from "../../utils/dates";

// Shown when Amble can't start normally: the saved data couldn't be read, or the app crashed.
// It deliberately does NOT depend on the app's own state, storage layer or styles - it brings its
// own CSS and talks to storage directly - so it still works when everything else is broken.
// Its promise is the one thing that matters here: nothing is changed or deleted without a safety
// copy, and the person can always get their data out.

function prefersDark() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY) || "null");
    const mode = saved && saved.mode;
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) {
    return false;
  }
}

const errorDetails = (error) => (error ? `${error.name || "Error"}: ${error.message || String(error)}${error.stack ? `\n\n${error.stack}` : ""}` : "");

export function RecoveryScreen({ reason, error }) {
  const [message, setMessage] = useState(null); // { tone: "ok" | "error", text }
  const [confirmingFresh, setConfirmingFresh] = useState(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [backups, setBackups] = useState([]);
  const unreadable = reason === "unreadable";

  // The desktop app keeps automatic backups; offer them here, where they matter most.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.storage && window.storage.listBackups) {
          const res = await window.storage.listBackups();
          if (alive && res && res.ok) setBackups(res.backups);
        }
      } catch (e) { /* no backups to offer */ }
    })();
    return () => { alive = false; };
  }, []);

  const reload = () => window.location.reload();

  const doExport = async () => {
    const res = await exportRawData(`amble-raw-data-${todayStr()}.json`);
    setMessage(res.ok ? { tone: "ok", text: "Your data was saved to a file." } : { tone: "error", text: res.empty ? "There's no saved data on this computer to export." : "The file couldn't be saved." });
  };

  const showRestoreResult = (res) => {
    if (res.ok) {
      const extra = describeReport(res.report);
      setRestored(true);
      setMessage({ tone: "ok", text: `Backup restored${extra ? ` (${extra})` : ""}. Your previous data was kept as a safety copy. Open Amble to continue.` });
    } else {
      setMessage({ tone: "error", text: `${res.error} Nothing was changed.` });
    }
  };

  const doRestore = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      showRestoreResult(await restoreFromBackupText(await file.text()));
    } catch (e) {
      setMessage({ tone: "error", text: "That file couldn't be read. Nothing was changed." });
    }
    setBusy(false);
  };

  const doRestoreAutomatic = async (backup) => {
    setBusy(true);
    try {
      const read = await window.storage.readBackup(backup.name);
      if (!read || !read.ok) setMessage({ tone: "error", text: `That backup couldn't be read${read && read.error ? ` (${read.error.message})` : ""}. Nothing was changed.` });
      else showRestoreResult(await restoreFromBackupText(read.value));
    } catch (e) {
      setMessage({ tone: "error", text: "That backup couldn't be restored. Nothing was changed." });
    }
    setBusy(false);
  };

  const doStartFresh = async () => {
    setBusy(true);
    const res = await startFresh();
    setBusy(false);
    if (res.ok) reload();
    else { setConfirmingFresh(false); setMessage({ tone: "error", text: res.error }); }
  };

  return (
    <div className={`app-loading recovery-screen${prefersDark() ? " dark" : ""}`}>
      <style>{CSS}</style>
      <div className="recovery-card">
        <h1 className="recovery-title">{unreadable ? "We couldn't read your saved data" : "Something went wrong"}</h1>
        <p className="recovery-text">
          {unreadable
            ? "Amble couldn't read the data saved on this computer, so it hasn't touched it: nothing has been overwritten or deleted. Choose how you'd like to continue."
            : "Amble ran into a problem and had to stop. Your saved data has not been changed."}
        </p>

        {message && <div className={message.tone === "error" ? "inline-error" : "recovery-ok"} role="status">{message.text}</div>}

        <div className="recovery-actions">
          {restored
            ? <button className="btn btn-primary" onClick={reload}>Open Amble</button>
            : <button className="btn btn-primary" onClick={reload}>{unreadable ? "Try loading again" : "Try again"}</button>}
          <button className="btn btn-ghost" onClick={doExport} disabled={busy}>Export my data</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>Import a backup file…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; doRestore(f); }} />
        </div>

        {backups.length > 0 && !restored && (
          <div style={{ margin: "18px 0" }}>
            <div className="recovery-text" style={{ marginBottom: 8 }}><strong>Restore an automatic backup</strong> - Amble keeps these on your computer. Your current data is kept as a safety copy first.</div>
            <BackupList backups={backups} onRestore={doRestoreAutomatic} disabled={busy} />
          </div>
        )}

        <div className="recovery-danger">
          {!confirmingFresh ? (
            <button className="btn btn-ghost tone-rust" onClick={() => setConfirmingFresh(true)} disabled={busy}>Start fresh…</button>
          ) : (
            <div className="inline-error" role="alert">
              <span style={{ flex: 1 }}>
                This clears the data Amble has saved and starts empty. A safety copy is kept inside Amble's storage first, but <strong>export your data if you want a file of your own</strong>.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingFresh(false)} disabled={busy}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={doStartFresh} disabled={busy}>Yes, start fresh</button>
            </div>
          )}
        </div>

        {error && (
          <details className="recovery-details">
            <summary>Technical details</summary>
            <pre>{errorDetails(error)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

// Shown in place of one screen when only that screen crashed. The sidebar still works, so the
// person can move elsewhere (which also resets this boundary) or get their data out.
export function ViewCrashCard({ error, onRetry, onGoHome }) {
  const [saved, setSaved] = useState(null);
  const doExport = async () => {
    const res = await exportRawData(`amble-raw-data-${todayStr()}.json`);
    setSaved(res.ok ? "Your data was saved to a file." : "There's no saved data to export.");
  };
  return (
    <div className="card" role="alert">
      <h2 className="recovery-title" style={{ fontSize: 18 }}>This screen ran into a problem</h2>
      <p className="recovery-text">The rest of Amble is fine and your data hasn't been changed. You can try again, go somewhere else, or save a copy of your data.</p>
      <div className="recovery-actions">
        <button className="btn btn-primary" onClick={onRetry}>Try again</button>
        {onGoHome && <button className="btn btn-ghost" onClick={onGoHome}>Go to Dashboard</button>}
        <button className="btn btn-ghost" onClick={doExport}>Export my data</button>
      </div>
      {saved && <p className="recovery-text" role="status">{saved}</p>}
      {error && (
        <details className="recovery-details">
          <summary>Technical details</summary>
          <pre>{errorDetails(error)}</pre>
        </details>
      )}
    </div>
  );
}
