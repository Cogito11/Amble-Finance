import React from "react";

// One line under a form explaining why Save is disabled. "empty" (not filled in yet) is shown
// quietly; "invalid" (something typed is wrong) in red. Renders nothing for a valid form.
export function FormHint({ check }) {
  if (!check || check.valid) return null;
  return (
    <p className={`form-hint ${check.kind === "invalid" ? "tone-rust" : "muted"}`} role="status">
      {check.hint}
    </p>
  );
}
