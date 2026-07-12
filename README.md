# Amble

**Free, easy-to-use personal finance software.** Amble is a desktop budgeting app for
Windows, macOS, and Linux that helps you track accounts, log transactions, and set real
budgets without having to create an account, pay a subscription, or deal with a steep 
learning curve. Just open the app and start tracking your finances.

🌐 **[Visit the website](https://cogito11.github.io/Amble-Finance/)**

---

## Features

- **All Your Accounts in One Place** - Keep track of all your accounts including checking, savings, and credit cards in one location with your net worth calculated automatically.
- **Budgets you can actually see** - Creating a budget for any type of spending will show you a live spending gauge to visualize exactly how much you've spend and what remains.
- **Plans that revolve around you** - You can create a budget plan around your paycheck, spliting it into
  categories which each have their own allocated amount and track your spending until the next paycheck rolls around.
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
[Releases page](https://github.com/Cogito11/Amble-Finance/releases)
or download from the
[Website](https://cogito11.github.io/Amble-Finance/)

### Build from source

```bash
# clone the repo
git clone https://github.com/Cogito11/Amble-Finance.git
cd Amble-Finance/Source

# install dependencies
npm install

# build executables for your current platform
npm run build

# alternative: run the program from source without building
npm start
```

Build output (installers) is written by `electron-builder` based on the platform you build on
- see `package.json` for the configured targets (Windows: portable + NSIS installer, macOS:
DMG + zip, Linux: AppImage + `.deb`).
- the completed builds can be found in the /dist folder in Source

## Tech stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/) for the UI
- [Electron](https://www.electronjs.org/) for the desktop shell
- [Recharts](https://recharts.org/) for charts
- [lucide-react](https://lucide.dev/) for icons
- Local storage only - no backend, no analytics, no network access needed

## Data & privacy

Amble doesn't have a server, an account system, or any analytics. All of your data, accounts,
transactions, categories, and budget plans are stored locally on your device. Use the built-in
**Data** export in the app's **More** tab any time you want a portable JSON backup.

## Contributing

Issues and pull requests are welcome. If you're proposing a larger change, opening an issue
first to discuss it is appreciated.

## License

MIT

## Maintainer

Built by **Cole Bishop** ([@cogito11](https://github.com/Cogito11)).
