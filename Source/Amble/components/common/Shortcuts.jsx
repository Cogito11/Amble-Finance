import React from "react";
import { Modal } from "./Modal";
import { SHORTCUTS } from "../../constants";

// Renders one shortcut's key combo as individual <kbd> badges, e.g. [⌘] + [N].
export function ShortcutKeys({ keys }) {
  return (
    <span className="shortcut-keys">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="kbd-plus">+</span>}
          <kbd className="kbd">{k}</kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

// Shared between the held-"?" preview overlay and the About tab's reference
// list, so both always show the exact same set of shortcuts.
export function ShortcutsList() {
  return (
    <div className="shortcuts-list">
      {SHORTCUTS.map((g) => (
        <div className="shortcuts-group" key={g.group}>
          <div className="shortcuts-group-title">{g.group}</div>
          {g.items.map((item) => (
            <div className="shortcut-row" key={item.label}>
              <span className="shortcut-label">{item.label}</span>
              <ShortcutKeys keys={item.keys} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// The quick-peek panel shown while "?" is held down (see the keydown/keyup
// handling in App). The same list is also always visible, unhidden, on the
// About tab for reference.
export function ShortcutsModal({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="modal-body">
        <ShortcutsList />
      </div>
    </Modal>
  );
}
