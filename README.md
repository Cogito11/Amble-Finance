# Amble

**Free, simple personal finance software for Windows, macOS, and Linux.**
Track your accounts, log transactions, and set budgets without creating an account, paying a
subscription, or learning a complicated tool. Everything stays on your computer.

🌐 [Website](https://cogito11.github.io/Amble-Finance/) · ⬇️ [Download](https://github.com/Cogito11/Amble-Finance/releases)

## What you can do

- **See everything in one place.** Checking, savings, and credit card accounts, with your net worth worked out for you.
- **Log transactions fast.** Record income, expenses, and transfers, then search and filter your history.
- **Budget with live gauges.** See how much you've spent in each category and how much is left.
- **Plan around your paycheck.** Split a paycheck into categories and track your spending until the next one.
- **Keep up with bills and goals.** Set up repeating bills (including quarterly and twice-a-year) and savings goals in the Plan tab.
- **Understand your money.** A dashboard shows net worth, spending by category, and income vs. expenses for the last six months. Nine built-in calculators cover things like loan payoff, debt payoff, compound interest, and emergency funds.
- **Make it yours.** Choose a light, dark, or system theme and your own currency, and pop any view out into its own window.
- **Back up any time.** Export all your data as JSON, or your transactions as CSV.

## Download

Get the latest version from the [Releases page](https://github.com/Cogito11/Amble-Finance/releases)
or the [website](https://cogito11.github.io/Amble-Finance/).

| System | Choose |
| --- | --- |
| Windows | **Installer** (recommended), or **Portable** to run from any folder or USB drive |
| macOS | **.dmg** (Apple Silicon / M-series Macs only) |
| Linux | **AppImage** or **.deb** |

Windows and Linux builds come in both x64 and ARM64.

## Staying up to date

Amble checks GitHub for a newer version shortly after it starts, and every few hours while it's open.
When there is one, a banner appears at the top of the window. Click **Download update**, then
**Restart now**. You don't need to download a new installer, and your data isn't touched. If you
choose **Later**, the update installs the next time you close Amble. You can also check yourself any
time in **More → About**.

| Your install | Updates inside the app? |
| --- | --- |
| Windows installer | Yes |
| Linux AppImage | Yes |
| Linux .deb | Yes (still in beta; asks for your password) |
| Windows portable | No. **More → About** links to the download page. |
| macOS | Not yet. **More → About** links to the download page. |

Versions before 1.7.3 can't update themselves. Install 1.7.3 or newer the usual way once, and from
then on you can update inside the app.

## Your data and privacy

- **It stays on your device.** There is no account, no server, and no analytics.
- **One online connection.** Amble contacts GitHub to check for new versions, and downloads one only
  if you choose to. None of your data is sent. There is currently no setting to turn the check off.
- **Plain files you can open.** **More → Data** shows where your data lives and has an **Open data
  folder** button. The main file is ordinary JSON.
- **Safe saving.** Changes are written so a crash or power cut can't leave a half-written file. If a
  save fails, Amble tells you why, keeps your changes on screen, and keeps retrying.
- **Automatic backups.** Amble keeps recent backups, plus one before any import, restore, reset, or
  delete. Restore one from **More → Data**, or from the recovery screen if your data file is ever damaged.
- **Damaged data is never overwritten.** Amble keeps the original, tells you what's wrong, and sets
  unreadable records aside so you can export them.
- **Several windows work together.** Changes made in a popped-out window and the main window are merged.

If you used an older version, your data is copied to its new location the first time you open the new
version. The old copy is left where it was.

## Build from source

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/Cogito11/Amble-Finance.git
cd Amble-Finance/Source

npm install        # always run this first, or the build can be missing parts
npm start          # run the app from source
npm test           # run the tests
npm run build      # build installers for your current platform (output goes to Source/release)
```

A build produces the installers for the system you build on: Windows (installer and portable),
macOS (.dmg and .zip), and Linux (AppImage and .deb).

Amble is built with [React](https://react.dev/) and [Vite](https://vitejs.dev/) for the interface,
[Electron](https://www.electronjs.org/) for the desktop app, [Recharts](https://recharts.org/) for charts,
[lucide-react](https://lucide.dev/) for icons, and [electron-updater](https://www.electron.build/auto-update) for updates.

## Publishing a release

For maintainers.

1. Set the new `version` in `Source/package.json`, and add the release notes to `PATCH_NOTES` in
   `Source/Amble/components/views/MoreView.jsx`.
2. Commit, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The **Build and Release** workflow builds every platform and uploads the installers, along with the
   `latest*.yml` files that tell installed copies a new version exists.
4. If GitHub creates the release as a draft, publish it. Installed copies only see published releases,
   and only offer a version higher than the one they're running.

In-place updates on macOS need Apple code signing, which the builds don't have yet. Once they do, set
`MAC_IN_PLACE_UPDATES` to `true` in `Source/updater.js`.

## Contributing

Issues and pull requests are welcome. For a larger change, please open an issue first to discuss it.

## License

[MIT](LICENSE). Built by **Cole Bishop** ([@cogito11](https://github.com/Cogito11)).
