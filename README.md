# Amble

**Free, easy-to-use personal finance software.** Amble is a desktop budgeting app for
Windows, macOS, and Linux that helps you track accounts, log transactions, and set real
budgets - without an account, a subscription, or a learning curve. Just open it and start
tracking.

🌐 **[Visit the website](https://cogito11.github.io/Amble-Finance/)**

---

## Features

- **Accounts, all in one place** - Track checking, savings, and credit cards together, with
  your net worth calculated automatically.
- **Budgets you can actually see** - Set a limit for any category and watch a live gauge show
  what's spent and what's left.
- **Budget plans that repeat themselves** - Build a plan around a paycheck, split it into
  categories, and set it active. Have it repeat weekly, every two weeks, monthly, or on your
  own schedule - and duplicate any plan to start a new one from an existing template.
- **Transactions in seconds** - Log income, expenses, and transfers quickly, then search and
  filter your history whenever you need it.
- **A dashboard that tells you something** - See net worth, spending by category, and income
  vs. expenses over the last six months at a glance.
- **Backup & restore** - Export your full data as a JSON file any time, or export your
  transactions as a CSV for a spreadsheet.
- **Your numbers stay yours** - Everything is stored locally on your computer. No account to
  create, no server to trust, nothing to subscribe to.

## Getting started

### Download

Download a build for your platform from the
[Releases page](https://github.com/Cogito11/Amble-Finance/releases).

### Run from source

Amble is a [Vite](https://vitejs.dev/) + [React](https://react.dev/) app wrapped in
[Electron](https://www.electronjs.org/).

```bash
# clone the repo
git clone https://github.com/Cogito11/Amble-Finance.git
cd Amble-Finance

# install dependencies
npm install

# run in development (hot-reloading Vite + Electron)
npm start
```

### Build installers

```bash
# build installers for your current platform
npm run build

# build an unpacked app directory only (faster, useful for testing)
npm run build:dir
```

Build output (installers) is written by `electron-builder` based on the platform you build on
- see `package.json` for the configured targets (Windows: portable + NSIS installer, macOS:
DMG + zip, Linux: AppImage + `.deb`).

## Project structure

```
├── Amble/              # Vite project root (React app source, assets)
├── main.js             # Electron main process
├── vite.config.js       # Vite config (builds into ../dist)
├── package.json          # scripts, dependencies, electron-builder config
└── docs/                # this project's website, served via GitHub Pages
```

## Tech stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/) for the UI
- [Electron](https://www.electronjs.org/) for the desktop shell
- [Recharts](https://recharts.org/) for charts
- [lucide-react](https://lucide.dev/) for icons
- Local storage only - no backend, no analytics, no network calls

## Data & privacy

Amble doesn't have a server, an account system, or any analytics. All of your data - accounts,
transactions, categories, and budget plans - is stored locally on your device. Use the built-in
**Data** export in the app's **More** tab any time you want a portable JSON backup.

## Contributing

Issues and pull requests are welcome. If you're proposing a larger change, opening an issue
first to discuss it is appreciated.

## License

MIT

## Maintainer

Built by **Cole Bishop** ([@cogito11](https://github.com/Cogito11)).
