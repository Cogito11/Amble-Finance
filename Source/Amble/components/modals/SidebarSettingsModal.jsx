import React from "react";
import { Modal } from "../common/Modal";
import { SidebarSettingsForm } from "../common/SidebarSettingsForm";

export function SidebarSettingsModal({ sections, visible, footerMetric, onToggle, onReorder, onChangeMetric, onClose }) {
  return (
    <Modal title="Customize sidebar" onClose={onClose}>
      <div className="modal-body">
        <SidebarSettingsForm
          sections={sections}
          visible={visible}
          footerMetric={footerMetric}
          onToggle={onToggle}
          onReorder={onReorder}
          onChangeMetric={onChangeMetric}
        />
      </div>
      <div className="modal-footer" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
