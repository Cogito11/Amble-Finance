import { useEffect, useState } from "react";

// The in-place updater lives in the desktop app's main process (see updater.js) and reaches the UI
// through `window.ambleUpdater`. A plain browser build has no such bridge, so this returns null there.
export function getUpdaterBridge() {
  return typeof window !== "undefined" && window.ambleUpdater ? window.ambleUpdater : null;
}

// Mirrors the main process's update state and exposes the three things the UI can ask for.
//   supported: true only when this install can really update itself. When it's false (browser build,
//              portable .exe, unsigned Mac build, ...) callers fall back to the "open the download page" flow.
//   state:     { status, version, percent, error, ... } - see updater.js for the possible values.
export function useUpdater() {
  const [state, setState] = useState(null);

  useEffect(() => {
    const bridge = getUpdaterBridge();
    if (!bridge) return undefined;
    let cancelled = false;
    bridge.getState().then((s) => { if (!cancelled && s) setState(s); }).catch(() => {});
    const unsubscribe = bridge.onStateChange((s) => { if (s) setState(s); });
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Each call returns the new state, and the main process also broadcasts it, so ignoring failures
  // here is safe: a failure arrives as `state.error`.
  const call = (name) => async () => {
    const bridge = getUpdaterBridge();
    if (!bridge) return;
    try {
      const next = await bridge[name]();
      if (next) setState(next);
    } catch (e) { /* surfaced through state.error */ }
  };

  return {
    supported: !!(state && state.supported),
    state,
    check: call("check"),
    download: call("download"),
    install: call("install"),
  };
}
