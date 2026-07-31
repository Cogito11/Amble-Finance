import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CAT_PALETTE } from "../../state/categories";

const MENU_WIDTH = 212;
const MENU_MARGIN = 10;

/* ---------------------------------- color swatch button ---------------------------------- */
// A small color dot that, when clicked, opens a popover grid of the category
// palette to pick from. Used anywhere a category's color can be manually set
// (the category modal, and each budget category row in the plan modal).
//
// The menu is positioned with `position: fixed`, anchored to the button's own
// on-screen coordinates, rather than `position: absolute` inside a relatively
// positioned wrapper. Both modals it lives in scroll their body internally
// (overflow-y: auto), which would otherwise clip an absolutely-positioned
// popover anywhere it extends past the modal's own box. A fixed element isn't
// clipped by an ancestor's overflow as long as nothing in between applies a
// transform, which is the case here - so the menu is always fully visible
// regardless of scroll position.
export function ColorSwatchButton({ color, onChange, label = "Choose color" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  const openMenu = () => {
    const rect = btnRef.current.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - MENU_MARGIN);
    setPos({ top: rect.bottom + 7, left: Math.max(MENU_MARGIN, left) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => { if (e.key === "Escape") setOpen(false); };
    // Since the menu's position is captured once on open rather than tracked
    // live, close it on scroll (the modal body, or the page) instead of
    // letting it drift out of sync with the button that anchored it.
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  return (
    <div className="color-swatch-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="color-swatch-btn"
        style={{ background: color }}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        title={label}
      />
      {open && pos && (
        <div className="color-swatch-menu" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          <div className="color-swatch-grid">
            {CAT_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="color-swatch-option"
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false); }}
                aria-label={c}
                title={c}
              >
                {c === color && <Check size={12} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
