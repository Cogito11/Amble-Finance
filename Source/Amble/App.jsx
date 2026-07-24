import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Loader2, Moon, Sun, MoreHorizontal, Sliders
} from "lucide-react";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { ShortcutsModal } from "./components/common/Shortcuts";
import { AccountModal } from "./components/modals/AccountModal";
import { CategoryModal } from "./components/modals/CategoryModal";
import { PlanModal } from "./components/modals/PlanModal";
import { TransactionModal } from "./components/modals/TransactionModal";
import { WidgetSettingsModal } from "./components/modals/WidgetSettingsModal";
import { SidebarSettingsModal } from "./components/modals/SidebarSettingsModal";
import { ToolsView } from "./components/tools/ToolsView";
import { AccountsView } from "./components/views/AccountsView";
import { BudgetsView } from "./components/views/BudgetsView";
import { Dashboard } from "./components/views/Dashboard";
import { MoreView } from "./components/views/MoreView";
import { PlansView } from "./components/views/PlansView";
import { TransactionsView } from "./components/views/TransactionsView";
import { NAV_ITEMS, SIDEBAR_KEY, STORAGE_KEY, THEME_KEY, VIEW_TITLES, WIDGETS_KEY, defaultWidgetPrefs } from "./constants";
import { computeBalance, isAssetAccount, isDebtAccount, migrateAccountOrder, nextTopAccountOrder, sortedAccountsList } from "./state/accounts";
import { clearRemovedCategoryRefs, refreshCategoryColors as redistributeCategoryColors, syncPlanCategories } from "./state/categories";
import { defaultState, migratePlanOrder, nextTopPlanOrder, rolloverDuePlans, sortedPlansList } from "./state/plans";
import { CSS } from "./styles/theme";
import { currentMonthKey, monthKeyOf, todayStr } from "./utils/dates";
import { fmt, setActiveCurrency } from "./utils/format";
import { isTypingTarget, uid } from "./utils/misc";

export default function App() {
  const sidebarSections = [...NAV_ITEMS, { id: "more", label: "More", icon: MoreHorizontal }];
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // Read the saved theme preference synchronously (rather than via an async
  // window.storage.get on mount) so the very first render already comes up in the
  // right theme. Doing this asynchronously used to cause two bugs: a visible flash
  // of light mode on every load for dark-mode users, and a race where the "save
  // current theme" effect below would fire with the default value and briefly
  // overwrite a saved preference before the async load resolved.
  //
  // themeMode is the user's explicit choice: "system" | "light" | "dark". A
  // fresh install (nothing saved yet) defaults to "system" so Amble matches
  // the OS/browser preference on first boot rather than assuming light mode.
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (!raw) return "system";
      const parsed = JSON.parse(raw);
      if (parsed.mode === "system" || parsed.mode === "light" || parsed.mode === "dark") {
        return parsed.mode;
      }
      // Migrate the old boolean-only { dark } preference (pre-tri-state Amble
      // versions) into an explicit light/dark choice, preserving what the
      // user last saw rather than silently switching them to "system".
      if (typeof parsed.dark === "boolean") return parsed.dark ? "dark" : "light";
      return "system";
    } catch (e) {
      return "system";
    }
  });

  // Tracks the OS/browser prefers-color-scheme setting so "system" mode can
  // resolve to an actual theme and update live if the user changes it while
  // Amble is open.
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    try {
      return typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setSystemPrefersDark(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", handleChange);
    else mql.addListener(handleChange); // Safari <14 fallback
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handleChange);
      else mql.removeListener(handleChange);
    };
  }, []);

  const darkMode = themeMode === "system" ? systemPrefersDark : themeMode === "dark";
  const [view, setView] = useState("dashboard");
  const contentRef = useRef(null);
  // Each view (dashboard, transactions, more, etc.) reuses the same scrollable
  // .content container, so switching views would otherwise leave you exactly
  // as scrolled as you were on the previous one. Snap back to the top whenever
  // the active view changes so every view is entered fresh.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view]);
  const [txModal, setTxModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [accError, setAccError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  // Same synchronous-read pattern as darkMode above, so returning users don't see
  // every widget flash on before their saved preference (some hidden) applies.
  const [dashboardWidgets, setDashboardWidgets] = useState(() => {
    try {
      const raw = localStorage.getItem(WIDGETS_KEY);
      return raw ? { ...defaultWidgetPrefs(), ...JSON.parse(raw) } : defaultWidgetPrefs();
    } catch (e) {
      return defaultWidgetPrefs();
    }
  });
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [sidebarModalOpen, setSidebarModalOpen] = useState(false);
  const [sidebarPrefs, setSidebarPrefs] = useState(() => {
    const defaultPrefs = { order: sidebarSections.map((section) => section.id), visible: Object.fromEntries(sidebarSections.map((section) => [section.id, true])), footerMetric: "netWorth" };
    try {
      const raw = localStorage.getItem(SIDEBAR_KEY);
      if (!raw) return defaultPrefs;
      const saved = JSON.parse(raw);
      const order = [...(saved.order || []).filter((id) => defaultPrefs.order.includes(id)), ...defaultPrefs.order.filter((id) => !(saved.order || []).includes(id))];
      return { order, visible: { ...defaultPrefs.visible, ...(saved.visible || {}) }, footerMetric: ["netWorth", "debt", "cash", "totalAssets", "netThisMonth"].includes(saved.footerMetric) ? saved.footerMetric : "netWorth" };
    } catch (e) {
      return defaultPrefs;
    }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Lets the global shortcut handler focus the transactions search box even
  // when it isn't mounted yet (e.g. Cmd+F pressed from the Dashboard) - the
  // handler flips this flag and switches views, and the effect below focuses
  // the input once the Transactions view (and its input) actually exists.
  const searchInputRef = useRef(null);
  const pendingFocusSearchRef = useRef(false);

  useEffect(() => {
    if (view === "transactions" && pendingFocusSearchRef.current) {
      pendingFocusSearchRef.current = false;
      const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [view]);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(THEME_KEY, JSON.stringify({ mode: themeMode }), false); }
      catch (e) { /* silent */ }
    })();
  }, [themeMode]);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(WIDGETS_KEY, JSON.stringify(dashboardWidgets), false); }
      catch (e) { /* silent */ }
    })();
  }, [dashboardWidgets]);

  useEffect(() => {
    (async () => {
      try { await window.storage.set(SIDEBAR_KEY, JSON.stringify(sidebarPrefs), false); }
      catch (e) { /* silent */ }
    })();
  }, [sidebarPrefs]);

  const toggleWidget = (id) => {
    setDashboardWidgets((w) => ({ ...w, [id]: !w[id] }));
  };

  const toggleSidebarSection = (id) => setSidebarPrefs((prefs) => ({ ...prefs, visible: { ...prefs.visible, [id]: !prefs.visible[id] } }));
  const reorderSidebarSection = (draggedId, targetId) => setSidebarPrefs((prefs) => {
    const order = [...prefs.order];
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return prefs;
    order.splice(to, 0, order.splice(from, 1)[0]);
    return { ...prefs, order };
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        const raw = res && res.value ? JSON.parse(res.value) : null;
        setState(raw ? {
          ...defaultState(),
          ...raw,
          plans: migratePlanOrder(Array.isArray(raw.plans) ? raw.plans : []),
          accounts: migrateAccountOrder(Array.isArray(raw.accounts) ? raw.accounts : []),
        } : defaultState());
      } catch (e) {
        setState(defaultState());
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setState((s) => (s ? rolloverDuePlans(s) : s));
  }, [loaded]);

  // Re-mirror the active plan's categories on load. This is what creates the
  // per-item sub-categories (e.g. "Netflix" under "Subscriptions") that power the
  // "specific expense" submenu on transactions. It's idempotent (reuses existing
  // links, never duplicates), so it also backfills plans that were set active
  // before that feature existed, without requiring the user to manually re-save.
  useEffect(() => {
    if (!loaded) return;
    setState((s) => {
      if (!s) return s;
      const active = s.plans.find((p) => p.active);
      if (!active) return s;
      const synced = syncPlanCategories(active, s.categories);
      const unchanged =
        JSON.stringify(synced.plan) === JSON.stringify(active) &&
        JSON.stringify(synced.categories) === JSON.stringify(s.categories);
      if (unchanged) return s;
      return {
        ...s,
        plans: s.plans.map((p) => (p.id === active.id ? synced.plan : p)),
        categories: synced.categories,
        transactions: clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds),
      };
    });
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !state) return;
    (async () => {
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(state), false); }
      catch (e) { /* silent - keeps working in-memory */ }
    })();
  }, [state, loaded]);

  // True whenever some overlay already has the user's attention - shortcuts other
  // than Escape stay quiet in that case so they can't stack a second dialog on
  // top or fire an action the visible modal doesn't expect.
  const anyOverlayOpen =
    txModal !== null || accModal !== null || catModal !== null || planModal !== null ||
    widgetModalOpen || sidebarModalOpen || !!confirmDialog || shortcutsOpen;

  // This must run unconditionally on every render (it's a hook), so it's declared
  // above the loading-state early return below. It bails out immediately while
  // data is still loading - before it touches anything that's only defined further
  // down in this component (like exportTransactionsCSV) - so it stays safe even
  // on that first, pre-`state` render.
  useEffect(() => {
    if (!loaded || !state) return;

    const handleKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      if (key === "Escape") {
        if (shortcutsOpen) { setShortcutsOpen(false); return; }
        if (confirmDialog) { setConfirmDialog(null); return; }
        if (widgetModalOpen) { setWidgetModalOpen(false); return; }
        if (sidebarModalOpen) { setSidebarModalOpen(false); return; }
        if (txModal !== null) { setTxModal(null); return; }
        if (accModal !== null) { setAccModal(null); setAccError(""); return; }
        if (catModal !== null) { setCatModal(null); return; }
        if (planModal !== null) { setPlanModal(null); return; }
        return;
      }

      if (anyOverlayOpen) return;

      if (mod && (key === "n" || key === "N")) {
        e.preventDefault();
        setTxModal({});
        return;
      }
      if (mod && (key === "f" || key === "F")) {
        e.preventDefault();
        if (view === "transactions") searchInputRef.current?.focus();
        else { pendingFocusSearchRef.current = true; setView("transactions"); }
        return;
      }
      if (mod && (key === "e" || key === "E")) {
        e.preventDefault();
        if (state.transactions.length > 0) exportTransactionsCSV();
        return;
      }
      if (mod && (key === "d" || key === "D")) {
        e.preventDefault();
        setThemeMode(darkMode ? "light" : "dark");
        return;
      }
      if (!mod && !isTypingTarget(document.activeElement)) {
        if (key === "?" && !e.repeat) {
          e.preventDefault();
          setShortcutsOpen(true);
          return;
        }
        const navByKey = { "1": "dashboard", "2": "transactions", "3": "accounts", "4": "budgets", "5": "plans", "6": "tools", "7": "more" };
        if (navByKey[key]) {
          setView(navByKey[key]);
          return;
        }
      }
    };

    // Releasing "?" ends the preview - this is what makes it a "hold to see"
    // panel rather than a toggle. A window blur (e.g. alt-tabbing away while
    // still holding the key) also closes it, since no keyup will otherwise fire.
    const handleKeyUp = (e) => {
      if (e.key === "?") setShortcutsOpen(false);
    };
    const handleBlur = () => setShortcutsOpen(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [loaded, view, txModal, accModal, catModal, planModal, widgetModalOpen, sidebarModalOpen, confirmDialog, shortcutsOpen, darkMode, anyOverlayOpen, state?.transactions?.length]);

  if (!loaded || !state) {
    return (
      <div className={`app-loading${darkMode ? " dark" : ""}`}>
        <style>{CSS}</style>
        <Loader2 className="spin" size={22} /> Loading your data…
      </div>
    );
  }

  // Every fmt() call in the tree (including deep child components) reads this
  // module-level variable, so it must be refreshed before anything below renders.
  setActiveCurrency(state.currency);

  const balances = {};
  state.accounts.forEach((a) => { balances[a.id] = computeBalance(a, state.transactions); });

  const saveTransaction = (t) => {
    setState((s) => {
      const exists = s.transactions.some((x) => x.id === t.id);
      return { ...s, transactions: exists ? s.transactions.map((x) => x.id === t.id ? t : x) : [...s.transactions, t] };
    });
    setTxModal(null);
  };
  const deleteTransaction = (id) => {
    setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) }));
    setTxModal(null);
  };
  const requestDeleteTransaction = (id) => {
    const t = state.transactions.find((x) => x.id === id);
    const label = t?.description?.trim() ? `“${t.description.trim()}”` : `this ${t?.type || ""} transaction`;
    setConfirmDialog({
      title: "Delete transaction?",
      message: `This will permanently delete ${label}. This can't be undone.`,
      onConfirm: () => { deleteTransaction(id); setConfirmDialog(null); },
    });
  };

  const saveAccount = (a) => {
    setState((s) => {
      const exists = s.accounts.some((x) => x.id === a.id);
      const accountToSave = typeof a.order === "number" ? a : { ...a, order: nextTopAccountOrder(s.accounts) };
      return { ...s, accounts: exists ? s.accounts.map((x) => x.id === accountToSave.id ? accountToSave : x) : [...s.accounts, accountToSave] };
    });
    setAccModal(null);
  };
  // Drag-and-drop reorder: moves the dragged account to the dropped-on account's
  // slot, then renumbers everyone sequentially - same pattern as reorderPlan.
  const reorderAccount = (draggedId, targetId) => {
    setState((s) => {
      const displayList = sortedAccountsList(s.accounts);
      const fromIndex = displayList.findIndex((a) => a.id === draggedId);
      const toIndex = displayList.findIndex((a) => a.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return s;
      const reordered = [...displayList];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      const orderById = new Map(reordered.map((a, i) => [a.id, i]));
      const accounts = s.accounts.map((a) => ({ ...a, order: orderById.get(a.id) }));
      return { ...s, accounts };
    });
  };
  const deleteAccount = (id) => {
    setState((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
    setAccModal(null);
    setAccError("");
  };
  const requestDeleteAccount = (id) => {
    const a = state.accounts.find((x) => x.id === id);
    const inUse = state.transactions.some((t) => t.accountId === id || t.toAccountId === id);
    if (inUse) { setAccError("This account has transactions on it. Delete those transactions first."); return; }
    setConfirmDialog({
      title: "Delete account?",
      message: `This will permanently delete “${a?.name || "this account"}”. This can't be undone.`,
      onConfirm: () => { deleteAccount(id); setConfirmDialog(null); },
    });
  };

  const saveCategory = (c) => {
    setState((s) => {
      const exists = s.categories.some((x) => x.id === c.id);
      return { ...s, categories: exists ? s.categories.map((x) => x.id === c.id ? c : x) : [...s.categories, c] };
    });
    setCatModal(null);
  };
  const deleteCategory = (id) => {
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      transactions: s.transactions.map((t) => t.categoryId === id ? { ...t, categoryId: null } : t),
    }));
    setCatModal(null);
  };
  const requestDeleteCategory = (id) => {
    const c = state.categories.find((x) => x.id === id);
    const inUse = state.transactions.some((t) => t.categoryId === id);
    setConfirmDialog({
      title: "Delete category?",
      message: inUse
        ? `This will permanently delete “${c?.name || "this category"}”. Transactions using it will become uncategorized. This can't be undone.`
        : `This will permanently delete “${c?.name || "this category"}”. This can't be undone.`,
      onConfirm: () => { deleteCategory(id); setConfirmDialog(null); },
    });
  };

  const savePlan = (p) => {
    setState((s) => {
      // Always sync, not just when this plan happens to be the active one.
      // Otherwise, removing an item from an itemized category on a budget
      // that isn't currently active leaves its mirrored category (and any
      // transaction still linked to it) stale until the budget is reactivated.
      const synced = syncPlanCategories(p, s.categories);
      const categories = synced.categories;
      const exists = s.plans.some((x) => x.id === synced.plan.id);
      // New plans always land at the top; edits keep whatever order they already had.
      const planToSave = typeof synced.plan.order === "number" ? synced.plan : { ...synced.plan, order: nextTopPlanOrder(s.plans) };
      const transactions = clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds);
      let plans = exists ? s.plans.map((x) => (x.id === planToSave.id ? planToSave : x)) : [planToSave, ...s.plans];
      if (planToSave.active) plans = plans.map((x) => (x.id === planToSave.id ? x : { ...x, active: false }));
      return { ...s, plans, categories, transactions };
    });
    setPlanModal(null);
  };
  const deletePlan = (id) => {
    setState((s) => {
      // IDs of categories owned by this plan
      const deletedCategoryIds = s.categories
        .filter((c) => c.planId === id)
        .map((c) => c.id);

      return {
        ...s,

        // Remove the plan
        plans: s.plans.filter((p) => p.id !== id),

        // Remove all categories that belong to it
        categories: s.categories.filter((c) => c.planId !== id),

        // Prevent transactions from referencing deleted categories
        transactions: s.transactions.map((t) =>
          deletedCategoryIds.includes(t.categoryId)
            ? { ...t, categoryId: null }
            : t
        ),
      };
    });

    setPlanModal(null);
  };
  const requestDeletePlan = (id) => {
    const p = state.plans.find((x) => x.id === id);
    setConfirmDialog({
      title: "Delete budget?",
      message: `This will permanently delete “${p?.name || "this budget"}” and all of its categories. Transactions assigned to those categories will become uncategorized. This can't be undone.`,
      onConfirm: () => { deletePlan(id); setConfirmDialog(null); },
    });
  };
  const setActivePlan = (id) => {
    setState((s) => {
      const target = s.plans.find((p) => p.id === id);
      if (!target || target.active) {
        // toggling off, or plan not found - just clear active flags
        return { ...s, plans: s.plans.map((p) => ({ ...p, active: p.id === id ? false : p.active })) };
      }
      const synced = syncPlanCategories(target, s.categories);
      const plans = s.plans.map((p) => (p.id === id ? { ...synced.plan, active: true } : { ...p, active: false }));
      return { ...s, plans, categories: synced.categories, transactions: clearRemovedCategoryRefs(s.transactions, synced.removedCategoryIds) };
    });
  };
  // Moves a budget up/down one slot in the Plans list. Recomputes sequential
  // order values for every plan based on the *current* display order (from
  // sortedPlansList) so this also normalizes any plans that never had an
  // explicit order yet - safe to call regardless of prior manual reordering.
  const reorderPlan = (id, direction) => {
    setState((s) => {
      const displayList = sortedPlansList(s.plans);
      const index = displayList.findIndex((p) => p.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= displayList.length) return s;
      const reordered = [...displayList];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);
      const orderById = new Map(reordered.map((p, i) => [p.id, i]));
      const plans = s.plans.map((p) => ({ ...p, order: orderById.get(p.id) }));
      return { ...s, plans };
    });
  };
  const duplicatePlan = (id) => {
    const p = state.plans.find((x) => x.id === id);
    if (!p) return;
    setPlanModal({
      name: `${p.name} (Duplicate)`,
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      income: p.income,
      incomeItems: (p.incomeItems || []).map((it) => ({ id: uid(), name: it.name, amount: it.amount })),
      active: false,
      repeat: p.repeat ? { ...p.repeat } : { enabled: false, frequency: "monthly" },
      categories: (p.categories || []).map((c) => ({
        id: uid(),
        name: c.name,
        mode: c.mode,
        bulkAmount: c.bulkAmount,
        date: c.date || null,
        items: (c.items || []).map((i) => ({ id: uid(), name: i.name, amount: i.amount, date: i.date || null })),
      })),
    });
  };

  const setCurrency = (code) => {
    setState((s) => ({ ...s, currency: code }));
  };

  const exportJSON = () => {
    const backedUpAt = new Date().toISOString();
    const payload = { app: "amble-finance", version: 1, exportedAt: backedUpAt, data: { ...state, lastBackupAt: backedUpAt } };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amble-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setState((s) => ({ ...s, lastBackupAt: backedUpAt }));
  };

  const requestImportJSON = (file) => {
    (async () => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const data = parsed && typeof parsed === "object" && parsed.data ? parsed.data : parsed;
        const valid = data && Array.isArray(data.accounts) && Array.isArray(data.categories) && Array.isArray(data.transactions);
        if (!valid) throw new Error("bad shape");
        setConfirmDialog({
          title: "Import backup?",
          message: `This will replace all current accounts, categories, transactions, and plans with the contents of “${file.name}”. This can't be undone.`,
          confirmLabel: "Import & replace",
          onConfirm: () => {
            setState({
              ...defaultState(),
              accounts: migrateAccountOrder(data.accounts),
              categories: data.categories,
              transactions: data.transactions,
              plans: migratePlanOrder(Array.isArray(data.plans) ? data.plans : []),
              ...(data.currency ? { currency: data.currency } : {}),
              ...(data.lastBackupAt ? { lastBackupAt: data.lastBackupAt } : {}),
            });
            setConfirmDialog(null);
          },
        });
      } catch (e) {
        setConfirmDialog({
          title: "Import failed",
          message: "That file doesn't look like a valid Amble backup (.json). No changes were made.",
          confirmLabel: "OK",
          tone: "primary",
          hideCancel: true,
          onConfirm: () => setConfirmDialog(null),
        });
      }
    })();
  };

  const exportTransactionsCSV = () => {
    const accName = (id) => state.accounts.find((a) => a.id === id)?.name || "";
    const catName = (id) => state.categories.find((c) => c.id === id)?.name || "";
    const header = ["Date", "Type", "Description", "Account", "Transfer To", "Category", "Amount"];
    const rows = [...state.transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date,
        t.type,
        t.description || "",
        accName(t.accountId),
        t.type === "transfer" ? accName(t.toAccountId) : "",
        catName(t.categoryId),
        t.amount.toFixed(2),
      ]);
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amble-transactions-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestDeleteAllTransactions = () => {
    const n = state.transactions.length;
    setConfirmDialog({
      title: "Delete all transactions?",
      message: `This will permanently delete all ${n} transaction${n === 1 ? "" : "s"}. Accounts, categories, and budgets will be left in place. This can't be undone.`,
      onConfirm: () => {
        setState((s) => ({ ...s, transactions: [] }));
        setConfirmDialog(null);
      },
    });
  };

  const requestDeleteAllBudgets = () => {
    const n = state.plans.length;
    setConfirmDialog({
      title: "Delete all budgets?",
      message: `This will permanently delete all ${n} budget${n === 1 ? "" : "s"} and their categories. Transactions assigned to those categories will become uncategorized. This can't be undone.`,
      onConfirm: () => {
        setState((s) => {
          const deletedCategoryIds = s.categories.filter((c) => c.planId).map((c) => c.id);
          return {
            ...s,
            plans: [],
            categories: s.categories.filter((c) => !c.planId),
            transactions: s.transactions.map((t) => (deletedCategoryIds.includes(t.categoryId) ? { ...t, categoryId: null } : t)),
          };
        });
        setConfirmDialog(null);
      },
    });
  };

  const requestDeleteAllCategories = () => {
    const n = state.categories.length;
    setConfirmDialog({
      title: "Delete all categories?",
      message: `This will permanently delete all ${n} categor${n === 1 ? "y" : "ies"}, including any tied to your budgets. Transactions using them will become uncategorized. This can't be undone.`,
      onConfirm: () => {
        setState((s) => {
          const transactions = s.transactions.map((t) => (t.categoryId ? { ...t, categoryId: null } : t));
          // Strip the links from every plan's categories/items so they're treated as
          // brand-new the next time they're synced, instead of pointing at nothing.
          let plans = s.plans.map((p) => ({
            ...p,
            categories: (p.categories || []).map((c) => ({
              ...c,
              categoryId: undefined,
              items: (c.items || []).map((it) => ({ ...it, categoryId: undefined })),
            })),
          }));
          let categories = [];
          // Re-mirror the active budget right away so its category badges don't
          // disappear until the next reload.
          const active = plans.find((p) => p.active);
          if (active) {
            const synced = syncPlanCategories(active, categories);
            categories = synced.categories;
            plans = plans.map((p) => (p.id === active.id ? synced.plan : p));
          }
          return { ...s, categories, transactions, plans };
        });
        setConfirmDialog(null);
      },
    });
  };

  // Redistributes every category's color from scratch, spreading them out evenly
  // across CAT_PALETTE. Purely cosmetic and non-destructive, so unlike the other
  // maintenance actions this runs immediately without a confirmation dialog, and
  // can be run as many times as you like.
  const refreshCategoryColors = () => {
    setState((s) => {
      const { categories, changedCount } = redistributeCategoryColors(s.categories);
      return changedCount ? { ...s, categories } : s;
    });
  };

  const requestResetSampleData = () => {
    setConfirmDialog({
      title: "Reset sample/default data?",
      message: "This will permanently delete all of your accounts, transactions, categories, and budgets, replacing them with Amble's starter data. Your appearance and currency preferences are kept. This can't be undone.",
      confirmLabel: "Reset data",
      onConfirm: () => {
        setState((s) => ({ ...defaultState(), currency: s.currency }));
        setConfirmDialog(null);
      },
    });
  };

  const requestFactoryReset = () => {
    setConfirmDialog({
      title: "Factory reset application?",
      message: "This will permanently erase everything, including all accounts, transactions, categories, and budgets, and reset your appearance and currency preferences, returning Amble to a fresh install. This can't be undone.",
      confirmLabel: "Factory reset",
      onConfirm: () => {
        setState(defaultState());
        setThemeMode("system");
        setView("dashboard");
        setConfirmDialog(null);
      },
    });
  };

  const netWorth = state.accounts.reduce((s, a) => s + balances[a.id], 0);
  const totalDebt = state.accounts.filter(isDebtAccount).reduce((sum, account) => sum + Math.max(0, -balances[account.id]), 0);
  const totalAssets = state.accounts.filter(isAssetAccount).reduce((sum, account) => sum + balances[account.id], 0);
  const cash = state.accounts.filter((account) => account.type === "cash").reduce((sum, account) => sum + balances[account.id], 0);
  const netThisMonth = state.transactions.filter((transaction) => monthKeyOf(transaction.date) === currentMonthKey()).reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : transaction.type === "expense" ? -transaction.amount : 0), 0);
  const footerMetrics = {
    netWorth: { label: "Net worth", value: netWorth },
    debt: { label: "Debt", value: totalDebt },
    cash: { label: "Cash", value: cash },
    totalAssets: { label: "Total assets", value: totalAssets },
    netThisMonth: { label: "Net this month", value: netThisMonth },
  };
  const footerMetric = footerMetrics[sidebarPrefs.footerMetric] || footerMetrics.netWorth;
  const orderedSidebarSections = sidebarPrefs.order.map((id) => sidebarSections.find((section) => section.id === id)).filter(Boolean);

  return (
    <div className={`app-root${darkMode ? " dark" : ""}`}>
      <style>{CSS}</style>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">$</div>
            <div className="brand-text">
              <div className="brand-name">AMBLE</div>
              <div className="brand-sub">personal finance</div>
            </div>
          </div>
          <nav className="nav">
            {orderedSidebarSections.filter((item) => sidebarPrefs.visible[item.id]).map((item) => (
              <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)}>
                <item.icon size={18} /> <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div>
              <div className="nw-label">{footerMetric.label}</div>
              <div className="nw-value">{fmt(footerMetric.value)}</div>
            </div>
            <button className="icon-btn" onClick={() => setSidebarModalOpen(true)} title="Customize sidebar" aria-label="Customize sidebar"><Sliders size={16} /></button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <h1 className="view-title">{VIEW_TITLES[view]}</h1>
            <div className="topbar-actions">
              <button
                className="icon-btn theme-toggle"
                onClick={() => setThemeMode(darkMode ? "light" : "dark")}
                title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              >
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              {view === "dashboard" && (
                <button className="btn btn-ghost" onClick={() => setWidgetModalOpen(true)}><Sliders size={16} /> Customize</button>
              )}
              {view !== "more" && view !== "plans" && view !== "tools" && (
                <button className="btn btn-primary" onClick={() => setTxModal({})}><Plus size={16} /> Add transaction</button>
              )}
            </div>
          </header>
          <div className="content" ref={contentRef}>
            {view === "dashboard" && (
              <Dashboard
                accounts={state.accounts}
                categories={state.categories}
                transactions={state.transactions}
                balances={balances}
                plans={state.plans}
                onGoTx={() => { setView("accounts"); setAccModal({}); }}
                onNavigate={setView}
                widgets={dashboardWidgets}
                onCustomize={() => setWidgetModalOpen(true)}
              />
            )}
            {view === "transactions" && (
              <TransactionsView accounts={state.accounts} categories={state.categories} transactions={state.transactions} onEdit={setTxModal} onAdd={() => setTxModal({})} onDelete={requestDeleteTransaction} searchInputRef={searchInputRef} />
            )}
            {view === "accounts" && (
              <AccountsView accounts={state.accounts} balances={balances} onAdd={() => setAccModal({})} onEdit={setAccModal} onDelete={requestDeleteAccount} onReorder={reorderAccount} error={accError} />
            )}
            {view === "budgets" && (
              <BudgetsView
                categories={state.categories}
                transactions={state.transactions}
                onAdd={() => setCatModal({})}
                onEdit={setCatModal}
                onDelete={requestDeleteCategory}
                plans={state.plans}
                onEditPlan={setPlanModal}
                onGoPlans={() => setView("plans")}
              />
            )}
            {view === "plans" && (
              <PlansView
                plans={state.plans}
                transactions={state.transactions}
                onAdd={() => setPlanModal({})}
                onEdit={setPlanModal}
                onDelete={requestDeletePlan}
                onSetActive={setActivePlan}
                onDuplicate={duplicatePlan}
                onReorder={reorderPlan}
              />
            )}
            {view === "tools" && <ToolsView accounts={state.accounts} balances={balances} transactions={state.transactions} />}
            {view === "more" && (
              <MoreView
                onExportJSON={exportJSON}
                onImportJSON={requestImportJSON}
                onExportCSV={exportTransactionsCSV}
                transactionCount={state.transactions.length}
                themeMode={themeMode}
                onChangeThemeMode={setThemeMode}
                currency={state.currency || "USD"}
                onChangeCurrency={setCurrency}
                accountCount={state.accounts.length}
                budgetCount={state.plans.length}
                categoryCount={state.categories.length}
                onRefreshCategoryColors={refreshCategoryColors}
                dbSizeBytes={new Blob([JSON.stringify(state)]).size}
                lastBackupAt={state.lastBackupAt}
                onDeleteAllTransactions={requestDeleteAllTransactions}
                onDeleteAllBudgets={requestDeleteAllBudgets}
                onDeleteAllCategories={requestDeleteAllCategories}
                onResetSampleData={requestResetSampleData}
                onFactoryReset={requestFactoryReset}
                dashboardWidgets={dashboardWidgets}
                onToggleWidget={toggleWidget}
              />
            )}
          </div>
        </main>
      </div>

      {txModal !== null && (
        <TransactionModal
          initial={txModal}
          accounts={state.accounts}
          categories={state.categories}
          plans={state.plans}
          transactions={state.transactions}
          onSave={saveTransaction}
          onClose={() => setTxModal(null)}
          onDelete={requestDeleteTransaction}
        />
      )}
      {accModal !== null && (
        <AccountModal initial={accModal} onSave={saveAccount} onClose={() => { setAccModal(null); setAccError(""); }} onDelete={requestDeleteAccount} />
      )}
      {catModal !== null && (
        <CategoryModal initial={catModal} categories={state.categories} onSave={saveCategory} onClose={() => setCatModal(null)} onDelete={requestDeleteCategory} />
      )}
      {planModal !== null && (
        <PlanModal initial={planModal} onSave={savePlan} onClose={() => setPlanModal(null)} onDelete={requestDeletePlan} />
      )}
      {widgetModalOpen && (
        <WidgetSettingsModal widgets={dashboardWidgets} onToggle={toggleWidget} onClose={() => setWidgetModalOpen(false)} />
      )}
      {sidebarModalOpen && (
        <SidebarSettingsModal
          sections={orderedSidebarSections}
          visible={sidebarPrefs.visible}
          footerMetric={sidebarPrefs.footerMetric}
          onToggle={toggleSidebarSection}
          onReorder={reorderSidebarSection}
          onChangeMetric={(footerMetric) => setSidebarPrefs((prefs) => ({ ...prefs, footerMetric }))}
          onClose={() => setSidebarModalOpen(false)}
        />
      )}
      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          tone={confirmDialog.tone}
          hideCancel={confirmDialog.hideCancel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
