import React from "react";
import { Modal } from "../common/Modal";
import { DASHBOARD_WIDGETS } from "../../constants";

/* ---------------------------------- dashboard customize modal ---------------------------------- */
export function WidgetSettingsModal({ widgets, onToggle, onClose }) {
  return (
    <Modal title="Customize dashboard" onClose={onClose}>
      <div className="modal-body">
        <p className="settings-desc">Choose which widgets appear on your dashboard. Hidden widgets keep their data so nothing is deleted.</p>
        <div className="widget-toggle-list">
          {DASHBOARD_WIDGETS.map((item) => (
            <label key={item.id} className="widget-toggle-row">
              <input type="checkbox" checked={!!widgets[item.id]} onChange={() => onToggle(item.id)} />
              <div className="widget-toggle-text">
                <div className="widget-toggle-label">{item.label}</div>
                <div className="widget-toggle-desc">{item.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
