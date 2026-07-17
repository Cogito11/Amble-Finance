import React from "react";
import {
  ChevronRight
} from "lucide-react";

export function ToolCard({ tool, onOpen }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      className={`tool-card${tool.available ? "" : " tool-card-disabled"}`}
      onClick={() => tool.available && onOpen(tool.id)}
      disabled={!tool.available}
    >
      <div className="tool-card-icon"><Icon size={18} /></div>
      <div className="tool-card-text">
        <div className="tool-card-title">
          {tool.label}
          {!tool.available && <span className="tool-card-badge">Coming soon</span>}
        </div>
        <div className="tool-card-desc">{tool.desc}</div>
      </div>
      {tool.available && <ChevronRight size={16} className="tool-card-chevron" />}
    </button>
  );
}
