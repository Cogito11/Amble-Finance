/* ---------------------------------- CSS ---------------------------------- */
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
#root { height: 100%; }

.app-root, .app-loading {
  height: 100%;
  --ink: #f4f9fd;
  --surface: #ffffff;
  --surface-2: #eaf4fc;
  --border: #c3dcef;
  --brass: #1f7dc4;
  --brass-soft: rgba(91,184,245,0.16);
  --on-brass: #ffffff;
  --teal: #1c86a8;
  --rust: #c1544a;
  --amber: #c98a2c;
  --text: #123249;
  --text-muted: #5b7a91;
  --text-faint: #7c9db4;
  font-family: 'Inter', sans-serif;
  color: var(--text);
  background: var(--ink);
  min-height: 100vh;
}
.app-root.dark, .app-loading.dark {
  --ink: #1a212c;
  --surface: #212936;
  --surface-2: #293344;
  --border: #384457;
  --brass: #6fb8ee;
  --brass-soft: rgba(111,184,238,0.14);
  --on-brass: #16222c;
  --teal: #57b8ac;
  --rust: #e08277;
  --amber: #e0b361;
  --text: #e5edf5;
  --text-muted: #a7b8c9;
  --text-faint: #77899c;
}
.app-root.dark .inline-error { background: rgba(224,130,119,0.12); color: #f3b7ae; }
@media (prefers-reduced-motion: no-preference) {
  .app-root, .app-root *, .app-loading { transition: background-color .2s ease, border-color .2s ease, color .2s ease; }
}
.app-loading { display:flex; align-items:center; gap:10px; justify-content:center; height:100vh; color:var(--text-muted); }
.spin { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: no-preference) { @keyframes spin { to { transform: rotate(360deg); } } }

.app-root *:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

/* Lets native controls (scrollbars, date/select popups) pick a light or dark
   rendering that matches the app instead of always defaulting to light. */
.app-root { color-scheme: light; }
.app-root.dark { color-scheme: dark; }

/* Scrollbars, themed to match the app instead of the OS default. */
.app-root, .app-loading, .app-root * , .app-loading * {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.app-root ::-webkit-scrollbar, .app-loading ::-webkit-scrollbar { width:10px; height:10px; }
.app-root ::-webkit-scrollbar-track, .app-loading ::-webkit-scrollbar-track { background: transparent; }
.app-root ::-webkit-scrollbar-thumb, .app-loading ::-webkit-scrollbar-thumb {
  background-color: var(--border);
  border-radius: 20px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.app-root ::-webkit-scrollbar-thumb:hover, .app-loading ::-webkit-scrollbar-thumb:hover { background-color: var(--text-faint); }
.app-root ::-webkit-scrollbar-corner, .app-loading ::-webkit-scrollbar-corner { background: transparent; }

.app-shell { display: grid; grid-template-columns: 232px 1fr; height: 100vh; overflow: hidden; }

.sidebar { background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 20px 14px; height: 100%; overflow-y: auto; }
.brand { display:flex; align-items:center; gap:10px; padding: 6px 8px 20px; }
.brand-mark { width:34px; height:34px; border-radius:8px; background: var(--brass-soft); color: var(--brass); border:1px solid var(--brass); display:flex; align-items:center; justify-content:center; font-family:'Fraunces',serif; font-weight:600; font-size:22px; }
.brand-name { font-family:'Fraunces',serif; font-weight:600; font-size:16px; letter-spacing: 0.14em; }
.brand-sub { font-size: 11px; color: var(--text-faint); letter-spacing:0.04em; }

.nav { display:flex; flex-direction:column; gap:2px; flex:1; }
.nav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; background:transparent; border:none; color: var(--text-muted); font-size:14px; font-weight:500; cursor:pointer; text-align:left; border-left: 2px solid transparent; transition: background .15s, color .15s; }
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: var(--brass-soft); color: var(--brass); border-left: 2px solid var(--brass); }
.nav-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--brass-soft); }

.sidebar-footer { border-top:1px solid var(--border); padding-top:14px; margin-top:10px; display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
.sidebar-footer .icon-btn { margin-top:-5px; }
.nw-label { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.06em; }
.nw-value { font-family:'JetBrains Mono',monospace; font-size:19px; font-weight:600; color:var(--brass); margin-top:2px; }

.main { display:flex; flex-direction:column; min-width:0; height:100%; min-height:0; }
.topbar { display:flex; align-items:center; justify-content:space-between; padding: 22px 32px; border-bottom:1px solid var(--border); flex-shrink:0; }
.topbar-actions { display:flex; align-items:center; gap:10px; }
.theme-toggle { border:1px solid var(--border); background: var(--surface); width:36px; height:36px; align-items:center; justify-content:center; border-radius:8px; color: var(--text-muted); }
.theme-toggle:hover { color: var(--brass); border-color: var(--brass); }
.view-title { font-family:'Fraunces',serif; font-weight:600; font-size:24px; margin:0; }
.content { padding: 24px 32px 48px; overflow-y:auto; flex:1; min-height:0; }

.btn { display:inline-flex; align-items:center; gap:6px; border-radius:8px; padding:9px 14px; font-size:13.5px; font-weight:500; cursor:pointer; border:1px solid transparent; font-family:'Inter',sans-serif; transition: filter .15s, background .15s; }
.btn-primary { background: var(--brass); color: var(--on-brass); }
.btn-primary:hover { filter: brightness(1.08); }
.btn:disabled { opacity:0.4; cursor:not-allowed; }
.btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-danger { background: var(--rust); color: #ffffff; }
.btn-danger:hover { filter: brightness(1.08); }
.btn-sm { padding:6px 10px; font-size:12.5px; }
.icon-btn { background:transparent; border:none; color:var(--text-faint); cursor:pointer; padding:6px; border-radius:6px; display:flex; }
.icon-btn:hover { background: var(--surface-2); color: var(--text); }

.stat-row { display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:20px; }
.stat-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
.stat-label { font-size:12px; color:var(--text-faint); margin-top:8px; }
.stat-value { font-family:'JetBrains Mono',monospace; font-size:21px; font-weight:600; margin-top:2px; }

.tone-brass { color: var(--brass); }
.tone-teal { color: var(--teal); }
.tone-rust { color: var(--rust); }
.tone-amber { color: var(--amber); }

.card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:18px; }
.card.no-pad { padding:0; overflow:hidden; }
.card-title { font-family:'Fraunces',serif; font-weight:600; font-size:15px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.card-title.padded { padding: 18px 20px 0; }

.grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:18px; }
.grid-2-single { grid-template-columns: 1fr; }

.gauge-row { display:flex; gap:22px; flex-wrap:wrap; }

.dash-acc-list { display:flex; flex-direction:column; }
.dash-acc-row { display:flex; align-items:center; gap:12px; padding:10px 2px; border-bottom:1px solid var(--border); }
.dash-acc-row:last-child { border-bottom:none; }
.dash-acc-icon { background: var(--surface-2); border-radius:8px; width:32px; height:32px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.dash-acc-info { flex:1; min-width:0; }
.dash-acc-name { font-size:13.5px; font-weight:600; }
.dash-acc-type { font-size:11.5px; text-transform:uppercase; letter-spacing:0.03em; margin-top:1px; }
.dash-acc-balance { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:14px; flex-shrink:0; }

.dash-budget { display:flex; flex-direction:column; gap:12px; }
.dash-budget-name { font-family:'Fraunces',serif; font-weight:600; font-size:15.5px; }
.dash-budget-bar-track { position:relative; background: var(--surface-2); border:1px solid var(--border); border-radius:8px; height:10px; overflow:hidden; }
.dash-budget-bar-fill { height:100%; border-radius:8px; transition: width .3s ease; min-width: 2px; }
.dash-budget-bar-ticks { position:absolute; inset:0; pointer-events:none; }
.dash-budget-bar-tick { position:absolute; top:0; bottom:0; width:1px; background: rgba(0,0,0,0.12); transform: translateX(-0.5px); }
.dash-budget-bar-scale { display:flex; justify-content:space-between; margin-top:5px; font-size:11px; color: var(--text-faint); font-family:'JetBrains Mono',monospace; }
.dash-budget-bar-scale span:first-child { text-align:left; }
.dash-budget-bar-scale span:last-child { text-align:right; }
.gauge { display:flex; flex-direction:column; align-items:center; width:150px; }
.gauge-amount { font-family:'JetBrains Mono',monospace; fill: var(--text); font-size:16px; font-weight:600; }
.gauge-sub { font-family:'JetBrains Mono',monospace; fill: var(--text-faint); font-size:10.5px; }
.gauge-label { font-size:12.5px; color:var(--text-muted); margin-top:2px; text-align:center; }
.gauge-over { font-size:11px; color:var(--rust); margin-top:2px; }
.gauge-remaining { font-size:11px; color:var(--text-faint); margin-top:2px; text-align:center; }

.chart-empty { color: var(--text-faint); font-size:13.5px; padding: 30px 0; text-align:center; }
.pie-wrap { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.pie-chart-wrap { flex: 1 1 180px; min-width:150px; max-width:220px; }
.pie-legend { flex:1 1 160px; display:flex; flex-direction:column; gap:7px; min-width:140px; }
.legend-row { display:flex; align-items:center; gap:8px; font-size:12.5px; }
.legend-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.legend-name { flex:1; color:var(--text-muted); }
.legend-val { font-family:'JetBrains Mono',monospace; color:var(--text); }

.table { width:100%; border-collapse:collapse; font-size:13.5px; }
.table thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); font-weight:500; padding-bottom:8px; }
.table.full thead th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); font-weight:500; padding:14px 20px; border-bottom:1px solid var(--border); }
.table.full tbody td { padding:12px 20px; border-bottom:1px solid var(--border); }
.table.full tbody tr:last-child td { border-bottom:none; }
.table:not(.full) td { padding:8px 0; border-bottom:1px solid var(--border); }
.table:not(.full) tr:last-child td { border-bottom:none; }
.muted { color: var(--text-muted); }
.amount { font-family:'JetBrains Mono',monospace; font-weight:500; text-align:right; }
.col-center { text-align:center !important; }
.col-right { text-align:right !important; }
.row-actions { display:flex; gap:4px; justify-content:flex-end; }
.row-actions-cell { vertical-align:middle; }

.pill { display:inline-flex; align-items:center; gap:5px; font-size:12px; padding:3px 9px; border-radius:20px; border:1px solid var(--border); color:var(--text-muted); }
.pill-group { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }

.filter-bar { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.search-input { display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:8px 12px; flex:1; min-width:220px; color:var(--text-faint); }
.search-input:focus-within { border-color: var(--brass); box-shadow: 0 0 0 3px var(--brass-soft); }
.search-input input { background:transparent; border:none; color:var(--text); font-size:13.5px; width:100%; outline:none; }
.search-input input:focus, .search-input input:focus-visible { outline:none; }
.tx-column-heading { display:flex; align-items:center; gap:4px; position:relative; white-space:nowrap; }
.tx-column-heading-right { justify-content:flex-end; }
.tx-column-filter { display:flex; }
.tx-filter-trigger { display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:var(--text-faint); padding:3px; border-radius:4px; cursor:pointer; }
.tx-filter-trigger:hover, .tx-filter-trigger.active { color:var(--brass); background:var(--brass-soft); }
.tx-filter-menu { position:absolute; z-index:15; top:calc(100% + 7px); left:0; width:220px; padding:12px; border:1px solid var(--border); border-radius:9px; background:var(--surface); box-shadow:0 12px 24px rgba(0,0,0,0.16); display:flex; flex-direction:column; gap:7px; text-transform:none; letter-spacing:normal; font-size:12px; font-weight:400; color:var(--text-muted); }
.tx-column-heading-right .tx-filter-menu { left:auto; right:0; }
.tx-filter-menu-title { display:flex; align-items:center; justify-content:space-between; color:var(--text); font-size:13px; font-weight:600; padding-bottom:5px; border-bottom:1px solid var(--border); }
.tx-filter-menu-title .icon-btn { padding:2px; }
.tx-filter-menu label { font-size:11px; color:var(--text-faint); margin-top:3px; }
.tx-filter-menu .select, .tx-filter-menu .input { width:100%; min-width:0; padding:7px 8px; font-size:12px; }
.card.no-pad.tx-empty { display:flex; flex-direction:column; min-height:420px; }
.card.no-pad.tx-empty .table.full { flex:1; height:100%; }
.table.full tbody td.tx-filter-empty { padding:34px 20px; min-height:280px; text-align:center; color:var(--text-muted); }
.tx-filter-empty strong, .tx-filter-empty span { display:block; }
.tx-filter-empty strong { color:var(--text); font-size:14px; margin-bottom:4px; }
.tx-filter-empty span { font-size:12.5px; }
.tx-filter-empty .btn { margin-top:12px; }
.select, .input { background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 12px; color:var(--text); font-size:13.5px; font-family:'Inter',sans-serif; }
.input[readonly] { color: var(--text-muted); cursor:default; }
.input.mono, .select.mono { font-family:'JetBrains Mono',monospace; }
/* Hide the native up/down stepper on number inputs, and stop mouse-wheel scroll
   from silently changing their value (see onWheel={blurOnWheel} on each input). */
input[type="number"] { -moz-appearance: textfield; }
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.select:hover, .input:hover { border-color: var(--text-faint); }
.select:focus, .input:focus { outline: none; border-color: var(--brass); }

.acc-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px; }
.acc-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; display:flex; flex-direction:column; gap:2px; transition: opacity .15s, border-color .15s, transform .1s; }
.acc-card[draggable="true"] { cursor:grab; }
.acc-card[draggable="true"]:active { cursor:grabbing; }
.acc-card-dragging { opacity:0.4; }
.acc-card-drop-target { border-color: var(--brass); border-style: dashed; }
.acc-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.acc-icon { background: var(--surface-2); border-radius:8px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; }
.acc-name { font-weight:600; font-size:14.5px; }
.acc-type { font-size:11.5px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px; }
.acc-balance { font-family:'JetBrains Mono',monospace; font-size:19px; font-weight:600; }
.acc-sub { font-size:11px; margin-top:2px; }
.acc-add { align-items:center; justify-content:center; gap:8px; color:var(--text-faint); cursor:pointer; border-style:dashed; }
.acc-add:hover { color: var(--brass); border-color: var(--brass); }

.inline-error { display:flex; align-items:center; gap:8px; background: rgba(193,84,74,0.1); border:1px solid var(--rust); color:#8a3327; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:14px; }

.empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding: 70px 20px; color: var(--text-faint); text-align:center; }
.empty-title { font-family:'Fraunces',serif; font-size:17px; font-weight:600; color: var(--text); margin-top:4px; }
.empty-message { font-size:13.5px; max-width:340px; margin-bottom:8px; }

.modal-overlay { position:fixed; inset:0; background: rgba(10,10,7,0.6); display:flex; align-items:center; justify-content:center; z-index:50; padding:20px; }
.modal { background: var(--surface); border:1px solid var(--border); border-radius:14px; width:100%; max-width:440px; max-height:90vh; overflow-y:auto; }
.modal.modal-sm { max-width: 380px; }
.modal.modal-lg { max-width: 640px; }
.confirm-message { font-size:13.5px; color:var(--text-muted); line-height:1.55; margin:0; }

.plans-view { display:flex; flex-direction:column; gap:16px; }
.plans-header { display:flex; justify-content:flex-end; }
.plans-list { display:flex; flex-direction:column; gap:14px; }
.plan-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 20px; display:flex; flex-direction:column; gap:10px; }
.plan-card.plan-active { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
.plan-card-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.plan-card-name { font-family:'Fraunces',serif; font-weight:600; font-size:15.5px; display:flex; align-items:center; gap:8px; }
.plan-active-pill { border-color: var(--brass); color: var(--brass); background: var(--brass-soft); }
.plan-card-dates { font-size:12px; }
.plan-card-stats { display:flex; gap:28px; flex-wrap:wrap; }
.plan-stat-label { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.04em; }
.plan-stat-value { font-family:'JetBrains Mono',monospace; font-size:16.5px; font-weight:600; margin-top:2px; }
.plan-card-cats { display:flex; gap:6px; flex-wrap:wrap; }
.plan-card-footer { display:flex; justify-content:flex-end; }
.plan-card-catlist { border-top:1px solid var(--border); padding-top:10px; }
.plan-cat-table th, .plan-cat-table td { font-size:12.5px; }
.plan-cat-parent-row { cursor:pointer; }
.plan-cat-parent-row:hover { background: var(--brass-soft); }
.plan-cat-expand-cell { display:inline-flex; align-items:center; gap:6px; font-weight:500; }
.plan-cat-chevron { color: var(--text-faint); flex-shrink:0; transition: transform .15s ease; }
.plan-cat-chevron.expanded { transform: rotate(90deg); }
.plan-cat-item-subrow { background: var(--surface-2); }
.plan-cat-item-name-cell { padding-left:23px !important; color:var(--text-muted); }


.plan-active-card { display:flex; flex-direction:column; gap:10px; }
.plan-active-name { font-family:'Fraunces',serif; font-weight:600; font-size:17px; }
.plan-active-empty { flex-direction:row; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.plan-empty-text { flex:1; min-width:220px; }
.plan-empty-title { font-family:'Fraunces',serif; font-weight:600; font-size:15px; margin-bottom:4px; }
.plan-cats-empty { padding: 0 20px 20px; margin:0; }

.plan-summary-bar { display:flex; gap:24px; background: var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 16px; }
.plan-summary-bar > div { display:flex; flex-direction:column; gap:2px; font-size:12px; }
.plan-summary-bar strong { font-family:'JetBrains Mono',monospace; font-size:15px; font-weight:600; }
.plan-summary-pct { margin-left:auto; align-items:flex-end; text-align:right; }
.plan-repeat-block { display:flex; flex-direction:column; gap:8px; border:1px solid var(--border); border-radius:10px; padding:12px 14px; background: var(--surface-2); }
.checkbox-row { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:500; cursor:pointer; }
.checkbox-row input[type="checkbox"] { width:15px; height:15px; accent-color: var(--brass); cursor:pointer; }

.widget-toggle-list { display:flex; flex-direction:column; }
.widget-toggle-row { display:flex; align-items:flex-start; gap:11px; padding:12px 2px; border-bottom:1px solid var(--border); cursor:pointer; }
.widget-toggle-row:last-child { border-bottom:none; }
.widget-toggle-row input[type="checkbox"] { width:15px; height:15px; margin-top:2px; accent-color: var(--brass); cursor:pointer; flex-shrink:0; }
.widget-toggle-text { display:flex; flex-direction:column; gap:2px; }
.widget-toggle-label { font-size:13.5px; font-weight:600; }
.widget-toggle-desc { font-size:12px; color:var(--text-muted); line-height:1.45; }
.sidebar-settings-list { display:flex; flex-direction:column; border-top:1px solid var(--border); }
.sidebar-settings-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:46px; border-bottom:1px solid var(--border); padding:7px 2px; cursor:grab; }
.sidebar-settings-row-dragging { opacity:0.45; }
.sidebar-settings-row-drop-target { border-color:var(--brass); box-shadow:0 -2px 0 var(--brass); }
.sidebar-settings-grip { color:var(--text-faint); flex-shrink:0; }
.sidebar-metric-select { margin:2px 0 0; }
.plan-repeat-seg { flex-wrap:wrap; }
.plan-repeat-seg .seg-btn { flex:1 1 auto; white-space:nowrap; padding:7px 10px; }
.plan-categories { display:flex; flex-direction:column; gap:12px; }
.plan-categories-header { display:flex; align-items:center; justify-content:space-between; }
.plan-add-category-btn { align-self:flex-start; }
.plan-cat-block { border:1px solid var(--border); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:10px; background: var(--surface-2); }
.plan-cat-move-btns, .plan-move-btns { display:flex; flex-direction:column; gap:1px; flex-shrink:0; }
.plan-cat-move-btn, .plan-move-btn { width:18px; height:15px; padding:0; border-radius:4px; }
.plan-cat-move-btn:disabled, .plan-move-btn:disabled { opacity:0.3; cursor:default; }
.plan-cat-row { display:flex; align-items:center; gap:8px; }
.plan-cat-row .input { flex:1; }
.plan-cat-seg { flex-shrink:0; width:160px; }
.plan-cat-bulk { margin:0; }
.plan-items { display:flex; flex-direction:column; gap:8px; }
.plan-item-row { display:flex; align-items:center; gap:8px; }
.plan-item-row .input { flex:1; }
.plan-item-amount { width:110px; flex-shrink:0; }
.plan-item-date { width:150px; flex-shrink:0; }
.plan-items-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.plan-cat-subtotal { font-size:12px; }

.debt-row-header, .debt-row { display:grid; grid-template-columns: 1.6fr 1fr 0.7fr 1fr 28px; gap:8px; align-items:center; }
.debt-row-header { font-size:11px; color: var(--text-faint); text-transform:uppercase; letter-spacing:0.03em; padding:0 2px 4px; }
.debt-row { margin-bottom:8px; }
.debt-payoff-order-row { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px; padding:6px 0; border-bottom:1px solid var(--border); }
.debt-payoff-order-row:last-of-type { border-bottom:none; }
.tool-strategy-explainer { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.tool-strategy-name { display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px; margin-bottom:4px; color: var(--text); }
.tool-strategy-explainer p { font-size:12.5px; color: var(--text-muted); line-height:1.5; margin:0; }

.tools-view { display:flex; flex-direction:column; gap:26px; }
.tools-category { display:flex; flex-direction:column; gap:12px; }
.tools-category-title { display:flex; align-items:center; gap:8px; font-family:'Fraunces',serif; font-weight:600; font-size:15px; color: var(--text); }
.tools-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:14px; }
.tool-card { display:flex; align-items:center; gap:14px; text-align:left; background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; cursor:pointer; transition: border-color .15s, background .15s; }
.tool-card:hover:not(.tool-card-disabled) { border-color: var(--brass); background: var(--brass-soft); }
.tool-card-disabled { cursor:default; opacity:0.6; }
.tool-card-icon { flex-shrink:0; width:38px; height:38px; border-radius:9px; display:flex; align-items:center; justify-content:center; background: var(--brass-soft); color: var(--brass); }
.tool-card-text { flex:1; min-width:0; }
.tool-card-title { font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.tool-card-badge { font-size:10px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color: var(--text-faint); background: var(--surface-2); border:1px solid var(--border); border-radius:5px; padding:2px 6px; }
.tool-card-desc { font-size:12px; color: var(--text-muted); margin-top:3px; line-height:1.45; }
.tool-card-chevron { flex-shrink:0; color: var(--text-faint); }
.tool-detail { display:flex; flex-direction:column; gap:16px; }
.tool-detail .card > .form-group + .form-group,
.tool-detail .card > .form-row + .form-group,
.tool-detail .card > .form-group + .form-row,
.tool-detail .card > .form-row + .form-row { margin-top:14px; }
.tool-back-btn { align-self:flex-start; }
.tool-page-title { display:flex; align-items:center; gap:9px; font-family:'Fraunces',serif; font-weight:600; font-size:17px; color: var(--text); }
.tool-result-row { grid-template-columns: repeat(3, 1fr); margin-bottom:0; }
.card-corner-seg { padding:2px; flex-shrink:0; }
.card-corner-seg .seg-btn { padding:3px 9px; font-size:11px; white-space:nowrap; }
.tool-note { font-size:12px; color: var(--text-muted); line-height:1.5; }
.tool-highlight-card { display:flex; flex-direction:column; gap:4px; align-items:flex-start; }
.tool-highlight-label { font-size:12px; color: var(--text-muted); text-transform:uppercase; letter-spacing:.03em; }
.tool-highlight-value { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:30px; color: var(--brass); }
.budget-rule-rows { display:flex; flex-direction:column; gap:16px; }
.budget-rule-row { display:flex; flex-direction:column; gap:6px; }
.budget-rule-row-top { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:13.5px; font-weight:500; }
.budget-rule-row-top strong { font-family:'JetBrains Mono',monospace; font-size:15px; }

.more-view { display:flex; flex-direction:column; gap:16px; }
.more-tabs { max-width:360px; margin-bottom:2px; }
.settings-desc { font-size:12.5px; color:var(--text-muted); line-height:1.55; margin:0 0 12px; }
.settings-actions { display:flex; gap:8px; flex-wrap:wrap; }
.settings-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:14px; margin-bottom:14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.theme-mode-seg { flex:0 0 auto; }
.theme-mode-seg .seg-btn { white-space:nowrap; padding:7px 12px; }
.settings-row-label { font-size:13.5px; font-weight:500; margin-bottom:2px; }
.more-tab-placeholder { margin:0; }

.about-card { display:flex; flex-direction:column; gap:16px; }
.about-brand { display:flex; align-items:center; gap:14px; }
.about-brand-mark { width:44px; height:44px; font-size:26px; }
.about-app-name { font-family:'Fraunces',serif; font-weight:600; font-size:19px; }
.about-details { display:flex; flex-direction:column; }
.about-row { display:flex; align-items:center; gap:8px; padding:9px 0; border-bottom:1px solid var(--border); font-size:13px; }
.about-row > .muted:first-child { flex:0 0 140px; }
.about-row:last-child { border-bottom:none; }
.about-links { padding-top:2px; }

.kbd {
  display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px;
  padding:0 6px; border-radius:6px; font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:600;
  color: var(--text); background: var(--surface-2); border:1px solid var(--border);
  box-shadow: 0 1.5px 0 var(--border);
}
.kbd-plus { color: var(--text-faint); font-size:11px; }
.shortcuts-list { display:flex; flex-direction:column; gap:18px; }
.shortcuts-group-title { font-size:11.5px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color: var(--text-faint); margin-bottom:8px; }
.shortcut-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:7px 0; border-bottom:1px solid var(--border); }
.shortcut-row:last-child { border-bottom:none; }
.shortcut-label { font-size:13px; }
.shortcut-keys { display:flex; align-items:center; gap:4px; flex-shrink:0; }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid var(--border); }
.modal-header h2 { font-family:'Fraunces',serif; font-size:17px; font-weight:600; margin:0; }
.modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:14px; }
.modal-footer { display:flex; align-items:center; justify-content:space-between; padding:16px 22px; border-top:1px solid var(--border); }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-group label { font-size:12px; color:var(--text-muted); }
.form-group .input, .form-group .select { width:100%; }

.seg { display:flex; background: var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:3px; }
.seg-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:transparent; border:none; color:var(--text-muted); padding:7px; font-size:13px; font-weight:500; text-transform:capitalize; cursor:pointer; border-radius:6px; }
.seg-btn.active { background: var(--brass); color: var(--on-brass); }
.seg-btn:disabled { opacity:0.4; cursor:not-allowed; }

@media (max-width: 860px) {
  .app-shell { grid-template-columns: 1fr; grid-template-rows:auto 1fr; }
  .sidebar { flex-direction:row; align-items:center; padding:10px 14px; }
  .brand { padding:0; flex:1; }
  .sidebar-footer { display:none; }
  .nav { flex-direction:row; }
  .nav-item span { display:none; }
  .stat-row, .grid-2, .tools-grid, .tool-result-row { grid-template-columns: 1fr 1fr; }
  .content { padding:18px; }
  .topbar { padding:16px 18px; }
}
`;
