import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../Amble/components/common/ErrorBoundary";
import { RecoveryScreen, ViewCrashCard } from "../Amble/components/common/RecoveryScreen";
import { Dashboard } from "../Amble/components/views/Dashboard";
import { MoreView } from "../Amble/components/views/MoreView";

// React logs every caught render error to console.error; these tests throw on purpose.
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

const Bomb = ({ explode = true, value = "boom" }) => {
  if (explode) throw new Error(value);
  return <div>all good</div>;
};
const text = (renderer) => JSON.stringify(renderer.toJSON());
const make = (element) => { let r; act(() => { r = TestRenderer.create(element); }); return r; };
// All the text under a test-renderer node (JSON.stringify can't be used on live React elements - they're circular).
const textOf = (node) => (typeof node === "string" ? node : (node.children || []).map(textOf).join(""));

describe("ErrorBoundary", () => {
  it("renders its children when nothing is wrong", () => {
    expect(text(make(<ErrorBoundary fallback={<span>fallback</span>}><div>fine</div></ErrorBoundary>))).toContain("fine");
  });

  it("shows the fallback instead of unmounting everything when a child throws", () => {
    const r = make(<div><p>outside</p><ErrorBoundary fallback={<span>fallback</span>}><Bomb /></ErrorBoundary></div>);
    const out = text(r);
    expect(out).toContain("fallback");
    expect(out).toContain("outside"); // the rest of the tree survives
    expect(out).not.toContain("all good");
  });

  it("a function fallback receives the error and a reset that tries again", () => {
    let explode = true;
    const Flaky = () => <Bomb explode={explode} />;
    let seen;
    const r = make(
      <ErrorBoundary fallback={({ error, reset }) => { seen = { error, reset }; return <span>{`failed: ${error.message}`}</span>; }}>
        <Flaky />
      </ErrorBoundary>
    );
    expect(text(r)).toContain("failed: boom");
    explode = false;
    act(() => seen.reset());
    expect(text(r)).toContain("all good");
  });

  it("calls onError once with the error, and survives a handler that itself throws", () => {
    const onError = vi.fn(() => { throw new Error("handler broke"); });
    const r = make(<ErrorBoundary onError={onError} fallback={<span>fallback</span>}><Bomb value="first" /></ErrorBoundary>);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("first");
    expect(text(r)).toContain("fallback");
  });

  it("recovers by itself when resetKey changes (e.g. navigating away from a broken screen)", () => {
    const tree = (key, explode) => (
      <ErrorBoundary resetKey={key} fallback={<span>fallback</span>}><Bomb explode={explode} /></ErrorBoundary>
    );
    const r = make(tree("dashboard", true));
    expect(text(r)).toContain("fallback");
    act(() => r.update(tree("dashboard", false))); // same key: stays on the fallback
    expect(text(r)).toContain("fallback");
    act(() => r.update(tree("accounts", false))); // new key: tries again
    expect(text(r)).toContain("all good");
  });

  it("catches even `throw null`", () => {
    const Null = () => { throw null; }; // eslint-disable-line no-throw-literal
    const r = make(<ErrorBoundary fallback={({ error }) => <span>{`caught: ${error.message}`}</span>}><Null /></ErrorBoundary>);
    expect(text(r)).toContain("caught: Unknown error");
  });

  it("boundaries are independent: one screen failing doesn't blank its sibling", () => {
    const r = make(
      <div>
        <ErrorBoundary fallback={<span>left failed</span>}><Bomb /></ErrorBoundary>
        <ErrorBoundary fallback={<span>right failed</span>}><div>right ok</div></ErrorBoundary>
      </div>
    );
    const out = text(r);
    expect(out).toContain("left failed");
    expect(out).toContain("right ok");
  });

  it("contains a REAL view crashing on corrupt data (the original 'blank window' failure)", () => {
    const corrupt = { accounts: null, categories: [], transactions: [], balances: {}, budgets: [], onAdd() {}, onGoTx() {}, onNavigate() {}, onCustomize() {} };
    // Without a boundary this throws and React unmounts everything.
    expect(() => make(<Dashboard {...corrupt} />)).toThrow();
    const r = make(
      <ErrorBoundary name="screen" fallback={({ error }) => <ViewCrashCard error={error} onRetry={() => {}} onGoHome={() => {}} />}>
        <Dashboard {...corrupt} />
      </ErrorBoundary>
    );
    const out = text(r);
    expect(out).toContain("This screen ran into a problem");
    expect(out).toContain("Go to Dashboard");
  });
});

describe("RecoveryScreen", () => {
  const render = (props) => renderToStaticMarkup(<RecoveryScreen {...props} />);

  it("crash: says the data hasn't changed and offers every way out", () => {
    const html = render({ reason: "crash", error: new Error("kaboom") });
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Your saved data has not been changed");
    for (const label of ["Try again", "Export my data", "Import a backup file", "Start fresh"]) expect(html).toContain(label);
    expect(html).toContain("Technical details");
    expect(html).toContain("kaboul".replace("ul", "om")); // the error message is shown
  });

  it("unreadable data: says nothing was overwritten", () => {
    const html = render({ reason: "unreadable", error: new Error("Unexpected end of JSON input") });
    expect(html).toContain("We couldn&#x27;t read your saved data");
    expect(html).toContain("nothing has been overwritten or deleted");
    expect(html).toContain("Try loading again");
  });

  it("works with no error object, and brings its own styles (App's are gone when it's shown)", () => {
    const html = render({ reason: "crash" });
    expect(html).not.toContain("Technical details");
    expect(html).toContain("<style>");
    expect(html).toContain("recovery-card");
  });
});

describe("ViewCrashCard", () => {
  it("offers Go to Dashboard only when it can", () => {
    const withHome = renderToStaticMarkup(<ViewCrashCard error={new Error("x")} onRetry={() => {}} onGoHome={() => {}} />);
    const without = renderToStaticMarkup(<ViewCrashCard error={new Error("x")} onRetry={() => {}} />);
    expect(withHome).toContain("Go to Dashboard");
    expect(without).not.toContain("Go to Dashboard");
    expect(without).toContain("Try again");
    expect(without).toContain("Export my data");
  });
});

describe("MoreView: set-aside records card", () => {
  const baseProps = { onExportJSON() {}, onImportJSON() {}, onExportCSV() {}, transactionCount: 3, themeMode: "light", onChangeThemeMode() {}, currency: "USD", onChangeCurrency() {}, accountCount: 1, budgetCount: 1, categoryCount: 1, onRefreshCategoryColors() {}, dbSizeBytes: 100, lastBackupAt: null, onDeleteAllTransactions() {}, onDeleteAllBudgets() {}, onDeleteAllCategories() {}, onResetSampleData() {}, onFactoryReset() {}, dashboardWidgets: {}, onToggleWidget() {} };
  const dataTabText = (extra) => {
    const r = make(<MoreView {...baseProps} {...extra} />);
    const dataButton = r.root.findAll((n) => n.type === "button" && n.props.className && n.props.className.includes("seg-btn")).find((n) => /Data/.test(textOf(n)));
    act(() => dataButton.props.onClick());
    return textOf(r.root); // joined text, so "found {n} record{s}" reads as one sentence
  };

  it("is hidden when there is nothing set aside", () => {
    expect(dataTabText({ quarantineCount: 0 })).not.toContain("Set-aside records");
  });

  it("shows the count with export and delete actions when there is", () => {
    const out = dataTabText({ quarantineCount: 2, onExportQuarantine() {}, onClearQuarantine() {} });
    expect(out).toContain("Set-aside records");
    expect(out).toContain("2 record");
    expect(out).toContain("Export set-aside records");
    expect(out).toContain("Delete them");
  });
});
