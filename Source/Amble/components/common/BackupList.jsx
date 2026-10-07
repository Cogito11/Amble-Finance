import React from "react";
import { formatBytes } from "../../utils/format";

// The automatic backups the desktop app keeps (see store/fileStore.js), newest first, each with a Restore button.
// Shared by the More screen and the recovery screen.

const REASON_LABELS = {
  launch: "Start of a session",
  auto: "Periodic",
  "before-import": "Before an import",
  "before-restore": "Before a restore",
  "before-delete": "Before deleting data",
  "before-reset": "Before a reset",
};
export const backupReasonLabel = (reason) => REASON_LABELS[reason] || (String(reason).startsWith("before-") ? "Before a change" : "Automatic");

export function BackupList({ backups, onRestore, disabled = false }) {
  if (!backups || backups.length === 0) {
    return (
      <p className="settings-desc" style={{ marginBottom: 0 }}>
        No automatic backups yet. Amble makes one the first time you change your data in each session, then at most every 30 minutes, and before every import, restore or reset.
      </p>
    );
  }
  return (
    <div className="backup-list">
      {backups.map((b) => (
        <div className="backup-row" key={b.name}>
          <div style={{ minWidth: 0 }}>
            <div className="backup-when">{new Date(b.modifiedMs).toLocaleString()}</div>
            <div className="tool-note">{backupReasonLabel(b.reason)}{` · ${formatBytes(b.size)}`}</div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onRestore(b)}>Restore…</button>
        </div>
      ))}
    </div>
  );
}
