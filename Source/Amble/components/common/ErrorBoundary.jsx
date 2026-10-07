import React from "react";

// Catches an error thrown while rendering anything inside it and shows `fallback` instead of
// letting React unmount the whole app (a blank window). Used at three levels: around the whole
// app (-> recovery screen), around the current screen (-> a card, with the sidebar still working)
// and around dialogs (-> the dialog closes and a notice explains).
//   fallback:  a node, or ({ error, reset }) => node
//   resetKey:  when this value changes, the boundary clears its error and tries again
//              (e.g. the current view, so navigating away from a broken screen recovers it)
//   onError:   called once with (error, info) when something is caught
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    // `throw null` / `throw undefined` are legal JavaScript; don't let a falsy error hide that we caught one.
    return { hasError: true, error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error, info) {
    console.error(`[Amble] ${this.props.name || "A section"} crashed:`, error, info && info.componentStack);
    if (this.props.onError) {
      try { this.props.onError(error, info); } catch (e) { /* a failing handler must never take the boundary down with it */ }
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) this.setState({ hasError: false, error: null });
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === "function" ? fallback({ error: this.state.error, reset: this.reset }) : (fallback ?? null);
  }
}
