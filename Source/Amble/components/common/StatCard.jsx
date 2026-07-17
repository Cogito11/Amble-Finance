import React from "react";

/* ---------------------------------- small pieces ---------------------------------- */
export function StatCard({ label, value, tone, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ color: `var(--${tone})` }}><Icon size={18} /></div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value tone-${tone}`}>{value}</div>
    </div>
  );
}
