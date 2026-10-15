import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateBanner, UpdatesRow } from "../Amble/components/common/UpdateControls";
import { APP_INFO } from "../Amble/constants";

// Drives the real banner and About-tab row against a fake `window.ambleUpdater` (the preload bridge),
// to prove the UI shows the right thing for each update state and asks the main process for the right step.

const state = (patch = {}) => ({ supported: true, reason: null, status: "idle", currentVersion: "1.7.2", version: null, percent: null, error: null, ...patch });

function fakeBridge(initial) {
  let current = initial;
  const listeners = new Set();
  return {
    getState: vi.fn(async () => current),
    check: vi.fn(async () => current),
    download: vi.fn(async () => current),
    install: vi.fn(async () => current),
    onStateChange: vi.fn((cb) => { listeners.add(cb); return () => listeners.delete(cb); }),
    listenerCount: () => listeners.size,
    push(next) { current = next; listeners.forEach((cb) => cb(next)); },
  };
}

const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const buttonLabelled = (r, label) => r.root.findAllByType("button").find((b) => textOf(b).includes(label));
const linkLabelled = (r, label) => r.root.findAllByType("a").find((a) => textOf(a).includes(label));

async function mount(element) {
  let r;
  await act(async () => { r = TestRenderer.create(element); });
  await settle();
  return r;
}
const html = (r) => textOf(r.toJSON() || { children: [] });

let bridge;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = globalThis;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { delete globalThis.ambleUpdater; vi.restoreAllMocks(); });

describe("without an in-place updater (browser build, portable .exe, unsigned Mac build)", () => {
  it("no bridge at all: no banner, and the About row keeps the original GitHub check + download link", async () => {
    const banner = await mount(<UpdateBanner />);
    expect(banner.toJSON()).toBeNull();
    const row = await mount(<UpdatesRow />);
    expect(textOf(row.toJSON())).toContain("Check for update");
  });

  it("a bridge that reports 'unsupported' behaves the same way", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ supported: false, reason: "portable", status: "unsupported" }));
    const banner = await mount(<UpdateBanner />);
    expect(banner.toJSON()).toBeNull();
    const row = await mount(<UpdatesRow />);
    expect(textOf(row.toJSON())).toContain("Check for update");
    expect(bridge.check).not.toHaveBeenCalled(); // the manual path talks to GitHub itself, not the bridge
  });
});

describe("<UpdatesRow/> with an in-place updater", () => {
  it("idle: 'Check for update' asks the main process to check", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state());
    const r = await mount(<UpdatesRow />);
    await act(async () => { buttonLabelled(r, "Check for update").props.onClick(); });
    expect(bridge.check).toHaveBeenCalledTimes(1);
  });

  it("up to date / checking / failed labels", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "current" }));
    const r = await mount(<UpdatesRow />);
    expect(html(r)).toContain("Up to date");
    await act(async () => { bridge.push(state({ status: "checking" })); });
    expect(html(r)).toContain("Checking…");
    expect(buttonLabelled(r, "Checking…").props.disabled).toBe(true);
    await act(async () => { bridge.push(state({ status: "error", error: { phase: "check", message: "offline" } })); });
    expect(html(r)).toContain("Check failed");
  });

  it("available -> Download; downloading -> progress; downloaded -> Restart to update", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "available", version: "1.8.0" }));
    const r = await mount(<UpdatesRow />);
    await act(async () => { buttonLabelled(r, "Download v1.8.0").props.onClick(); });
    expect(bridge.download).toHaveBeenCalledTimes(1);

    await act(async () => { bridge.push(state({ status: "downloading", version: "1.8.0", percent: 42 })); });
    expect(html(r)).toContain("Downloading v1.8.0… 42%");

    await act(async () => { bridge.push(state({ status: "downloaded", version: "1.8.0", percent: 100 })); });
    await act(async () => { buttonLabelled(r, "Restart to update to v1.8.0").props.onClick(); });
    expect(bridge.install).toHaveBeenCalledTimes(1);
  });
});

describe("<UpdateBanner/>", () => {
  it("says nothing while idle, up to date, or checking (background checks are silent)", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state());
    const r = await mount(<UpdateBanner />);
    expect(r.toJSON()).toBeNull();
    for (const status of ["checking", "current"]) {
      await act(async () => { bridge.push(state({ status })); });
      expect(r.toJSON()).toBeNull();
    }
    // a failed check alone isn't banner-worthy either
    await act(async () => { bridge.push(state({ status: "error", error: { phase: "check", message: "offline" } })); });
    expect(r.toJSON()).toBeNull();
  });

  it("an update appears while the app is running, and 'Download update' starts the download", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state());
    const r = await mount(<UpdateBanner />);
    await act(async () => { bridge.push(state({ status: "available", version: "1.8.0" })); });
    expect(html(r)).toContain("Amble v1.8.0 is available.");
    await act(async () => { buttonLabelled(r, "Download update").props.onClick(); });
    expect(bridge.download).toHaveBeenCalledTimes(1);
  });

  it("shows download progress with nothing to click", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "downloading", version: "1.8.0", percent: 63 }));
    const r = await mount(<UpdateBanner />);
    expect(html(r)).toContain("Downloading Amble v1.8.0… 63%");
    expect(r.root.findAllByType("button")).toHaveLength(0);
  });

  it("downloaded: explains the restart, reassures about data, and 'Restart now' installs", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "downloaded", version: "1.8.0", percent: 100 }));
    const r = await mount(<UpdateBanner />);
    expect(html(r)).toContain("ready to install");
    expect(html(r)).toContain("your data stays where it is");
    expect(html(r)).toContain("next time you close Amble");
    await act(async () => { buttonLabelled(r, "Restart now").props.onClick(); });
    expect(bridge.install).toHaveBeenCalledTimes(1);
  });

  it("'Later' hides that notice, but a new state (download finished) shows it again", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "available", version: "1.8.0" }));
    const r = await mount(<UpdateBanner />);
    await act(async () => { buttonLabelled(r, "Later").props.onClick(); });
    expect(r.toJSON()).toBeNull();
    await act(async () => { bridge.push(state({ status: "downloaded", version: "1.8.0" })); });
    expect(html(r)).toContain("ready to install");
  });

  it("a failed download says why, offers Try again, and links to the manual download", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "available", version: "1.8.0", error: { phase: "download", message: "Couldn't reach GitHub." } }));
    const r = await mount(<UpdateBanner />);
    expect(html(r)).toContain("couldn't be downloaded: Couldn't reach GitHub.");
    await act(async () => { buttonLabelled(r, "Try again").props.onClick(); });
    expect(bridge.download).toHaveBeenCalledTimes(1);
    expect(linkLabelled(r, "Download manually").props.href).toBe(APP_INFO.downloadUrl);
  });

  it("a failed install retries the install, not the download", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state({ status: "downloaded", version: "1.8.0", error: { phase: "install", message: "boom" } }));
    const r = await mount(<UpdateBanner />);
    expect(html(r)).toContain("couldn't be installed: boom");
    await act(async () => { buttonLabelled(r, "Try again").props.onClick(); });
    expect(bridge.install).toHaveBeenCalledTimes(1);
    expect(bridge.download).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", async () => {
    globalThis.ambleUpdater = bridge = fakeBridge(state());
    const r = await mount(<UpdateBanner />);
    expect(bridge.listenerCount()).toBe(1);
    await act(async () => { r.unmount(); });
    expect(bridge.listenerCount()).toBe(0);
  });
});
