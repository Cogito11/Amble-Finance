import React, { useState } from "react";
import { GripVertical } from "lucide-react";
import { Modal } from "../common/Modal";

/* ---------------------------------- status page settings modal ---------------------------------- */
export function StatusSettingsModal({ sections, visible, onToggle, onReorder, onClose }) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  return (
    <Modal title="Customize status page" onClose={onClose}>
      <div className="modal-body">
        <p className="settings-desc">Choose which sections appear on the Status page and drag them into your preferred order.</p>
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
              <label className="checkbox-row status-settings-checkbox-row">
                <input type="checkbox" checked={!!visible[section.id]} onChange={() => onToggle(section.id)} />
                <div className="widget-toggle-text">
                  <div className="widget-toggle-label">{section.label}</div>
                  <div className="widget-toggle-desc">{section.description}</div>
                </div>
              </label>
              <GripVertical className="sidebar-settings-grip" size={18} aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
      <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
