import React from "react";
import {
  Plus
} from "lucide-react";

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <Icon size={32} strokeWidth={1.4} />
      <div className="empty-title">{title}</div>
      <div className="empty-message">{message}</div>
      {actionLabel && <button className="btn btn-primary" onClick={onAction}><Plus size={16} /> {actionLabel}</button>}
    </div>
  );
}
