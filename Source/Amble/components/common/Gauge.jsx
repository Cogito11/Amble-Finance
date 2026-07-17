import React from "react";
import { fmt } from "../../utils/format";

/* ---------------------------------- gauge ---------------------------------- */
export function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export function Gauge({ spent, limit, label, size = 148, footnote }) {
  const pct = limit > 0 ? spent / limit : 0;
  const displayPct = Math.min(pct, 1);
  const over = pct > 1;
  const color = over ? "var(--rust)" : pct > 0.85 ? "var(--amber)" : "var(--teal)";
  const cx = size / 2, cy = size / 2, r = size / 2 - 18;
  const track = describeArc(cx, cy, r, -135, 135);
  const value = describeArc(cx, cy, r, -135, -135 + 270 * displayPct);
  const ticks = [-135, -67.5, 0, 67.5, 135];
  const remaining = limit - spent;

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path d={track} stroke="var(--border)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {displayPct > 0 && (
          <path d={value} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
        )}
        {ticks.map((a, i) => {
          const p1 = polarToCartesian(cx, cy, r + 9, a);
          const p2 = polarToCartesian(cx, cy, r + 15, a);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--text-faint)" strokeWidth="1.5" />;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" className="gauge-amount">{fmt(spent)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="gauge-sub">of {fmt(limit)}</text>
      </svg>
      <div className="gauge-label">{label}</div>
      {footnote !== undefined ? (
        <div className="gauge-remaining">{footnote}</div>
      ) : over ? (
        <div className="gauge-over">+{fmt(spent - limit)} over</div>
      ) : (
        <div className="gauge-remaining">{fmt(remaining)} remaining</div>
      )}
    </div>
  );
}
