import React, { useState } from "react";
import { Menu } from "lucide-react";

// The sidebar's settings: which tabs show, their order (drag a row), and the footer value. Used by the
// "Customize sidebar" dialog and by the Sidebar card in More > Settings, so both always offer the same thing.
export function SidebarSettingsForm({ sections, visible, footerMetric, onToggle, onReorder, onChangeMetric }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  return (
    <>
      <p className="settings-desc">Choose the sections shown in the sidebar and drag them into your preferred order. The number keys 1-9 open the tabs in this order.</p>
      <div className="sidebar-settings-list">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`sidebar-settings-row ${dragId === section.id ? "sidebar-settings-row-dragging" : ""} ${overId === section.id && dragId !== section.id ? "sidebar-settings-row-drop-target" : ""}`}
            draggable
            onDragStart={() => setDragId(section.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(event) => { event.preventDefault(); setOverId(section.id); }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragId && dragId !== section.id) onReorder(dragId, section.id);
              setDragId(null);
              setOverId(null);
            }}
          >
            <label className="checkbox-row">
              <input type="checkbox" checked={!!visible[section.id]} onChange={() => onToggle(section.id)} />
              {section.label}
            </label>
            <Menu className="sidebar-settings-grip" size={18} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="form-group sidebar-metric-select">
        <label>Sidebar footer value</label>
        <select className="select" value={footerMetric} onChange={(event) => onChangeMetric(event.target.value)}>
          <option value="netWorth">Net Worth</option>
          <option value="debt">Debt</option>
          <option value="cash">Cash</option>
          <option value="totalAssets">Total Assets</option>
          <option value="netThisMonth">Net this month</option>
        </select>
      </div>
    </>
  );
}
