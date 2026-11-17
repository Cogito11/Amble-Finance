// Sidebar navigation helpers. The number keys 1-9 jump to the Nth tab you can currently see in your
// sidebar, in the order you've arranged them, so hiding or reordering a tab changes the shortcuts to match.

export const MAX_NAV_SHORTCUTS = 9;

// The ids of the tabs shown in the sidebar, top to bottom: saved order, minus hidden tabs and any id this
// version doesn't know about.
export function visibleNavIds(order, visible, knownIds) {
  return (order || []).filter((id) => knownIds.includes(id) && !!(visible && visible[id]));
}

// Which tab a number key opens (null for any other key, or a number past the last tab).
export function navShortcutTarget(key, ids) {
  if (typeof key !== "string" || !/^[1-9]$/.test(key)) return null;
  return ids[Number(key) - 1] || null;
}

// The key that opens a tab, as a string, or null when it's past the ninth tab and has no number key.
export function navShortcutKey(ids, id) {
  const index = ids.indexOf(id);
  return index >= 0 && index < MAX_NAV_SHORTCUTS ? String(index + 1) : null;
}

// The Navigation rows for the shortcuts list, from the tabs currently in the sidebar ({ id, label }).
export function navigationShortcuts(tabs) {
  return (tabs || []).slice(0, MAX_NAV_SHORTCUTS).map((tab, i) => ({ keys: [String(i + 1)], label: tab.label }));
}
