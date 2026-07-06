# Amble — personal finance & budget tracker

A calm, desktop-style budgeting app: accounts, transactions, category
budgets with gauge dials, and a dashboard with charts. This is the
standalone version — it runs as a normal website or as a native desktop
app via Electron, and it's yours to keep, host, or modify.

Your data is stored in the browser's `localStorage` (see `src/storage.js`).
Nothing is sent to a server — it all stays on the device you're using it on.
That also means data does **not** sync between your browser and a packaged
desktop build automatically — each one keeps its own local copy.

## 1. Install dependencies

You'll need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
npm install
```

## 2. Run it as a website (local dev)

```bash
npm run dev
```

Opens at `http://localhost:5173`. Edit `src/App.jsx` and it hot-reloads.

## 3. Build it as a website (to host anywhere)

```bash
npm run build
```

This outputs static files to `dist/`. Upload that folder's contents to
any static host — Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3, or
your own server. No backend required. You can preview the production
build locally first with `npm run preview`.

## 4. Run it as a desktop app (development)

```bash
npm run electron:dev
```

This starts the Vite dev server and opens it in an Electron window, with
dev tools attached. Good for testing before you package it.

## 5. Build it as an installable desktop app

```bash
npm run electron:build
```

This builds the web app and packages it with `electron-builder` into an
installer for your current platform, placed in `release/`:

- **macOS** → `.dmg`
- **Windows** → `.exe` (NSIS installer)
- **Linux** → `.AppImage`

Important: `electron-builder` packages for the platform you run it *on*.
To get a Windows `.exe`, run this command on Windows (or in a Windows CI
runner); for a macOS `.dmg`, run it on a Mac. Cross-building is possible
but has extra setup (code signing, Wine for Windows-from-Mac, etc.) —
happy to help with that if you need it.

If you just want a runnable folder without a formal installer (e.g. to
test quickly), use:

```bash
npm run electron:build:dir
```

## Project structure

```
amble-finance/
├── index.html            # HTML entry point
├── vite.config.js         # Vite build config
├── src/
│   ├── main.jsx            # React root
│   ├── App.jsx             # The whole app (UI, logic, styles)
│   └── storage.js          # localStorage-backed data layer
├── electron/
│   └── main.js             # Electron main process (creates the window)
└── package.json
```

## Notes

- Fonts (Fraunces, Inter, JetBrains Mono) load from Google Fonts over the
  network. If you need the app to work fully offline (e.g. in Electron
  with no internet), let me know and I can bundle the font files locally
  instead.
- To reset all data, clear the site's storage in your browser's dev tools
  (Application → Local Storage), or in the desktop app, clear Electron's
  local storage the same way via the dev tools.
