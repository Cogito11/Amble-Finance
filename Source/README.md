# Amble — personal finance & budget tracker

A calm, desktop-style budgeting app: accounts, transactions, category
budgets with gauge dials, and a dashboard with charts. This is packaged as
an Electron desktop app for your computer.

Your data is stored locally on your machine via the browser storage layer
Electron provides (`localStorage`, see `src/storage.js`) — nothing is sent
to a server, and nothing leaves your computer.

## 1. Install dependencies

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
npm install
```

## 2. Run it

```bash
npm start
```

This opens Amble in a desktop window, with dev tools attached and hot
reload enabled, so you can make changes to `src/App.jsx` and see them
immediately.

## 3. Build the desktop application

```bash
npm run build
```

This packages Amble into an installable desktop app for your current
operating system, placed in the `release/` folder:

- **macOS** → `Amble.dmg`
- **Windows** → `Amble Setup.exe`
- **Linux** → `Amble.AppImage`

Run this command on the OS you want to build for — `electron-builder`
packages for whatever platform it's running on. To get a `.exe`, run
`npm run build` on Windows; for a `.dmg`, run it on a Mac. Cross-building
onto a different OS is possible but needs extra setup (code signing, Wine
for building Windows installers from a Mac, etc.) — let me know if you
need that.

If you just want a runnable, unpacked app folder without a full installer
(useful for a quick test), use:

```bash
npm run build:dir
```

## Project structure

```
amble-finance/
├── index.html            # HTML entry point, loaded by the Electron window
├── vite.config.js         # Build config for bundling the React app
├── src/
│   ├── main.jsx             # React root
│   ├── App.jsx              # The whole app (UI, logic, styles)
│   └── storage.js           # localStorage-backed data layer
├── electron/
│   └── main.js               # Electron main process (creates the window)
└── package.json
```

## Notes

- Fonts (Fraunces, Inter, JetBrains Mono) load from Google Fonts over the
  network. If you want the app to work fully offline, let me know and I
  can bundle the font files locally instead.
- To reset all data, open dev tools in the app (it's already open in
  `npm start`; in the packaged build you can enable it temporarily in
  `electron/main.js`) and clear Application → Local Storage.
