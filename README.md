<div align="center">

# Altair Finance

### Privacy First Personal finance app for macOS.

**Accounts, transactions, and budgets in an encrypted file, opened with a passphrase you choose.**

[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#quick-start)
[![pnpm](https://img.shields.io/badge/pnpm-8.15-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-087EA4?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Electron](https://img.shields.io/badge/Electron-40-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org)
[![Tests](https://img.shields.io/badge/tests-CI-6E9F18?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/madeinusmate/altair-finance/actions/workflows/ci.yml)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLCipher](https://img.shields.io/badge/SQLCipher-encrypted%20SQLite-0F4C81?style=flat-square)](https://www.zetetic.net/sqlcipher/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

**[Issues](https://github.com/madeinusmate/altair-finance/issues) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)**

[Quick start](#quick-start) · [Features](#features) · [Desktop app](#desktop-app) · [FAQ](#faq) · [License](#license)

<code>pnpm install && pnpm dev</code>

<br />

<table aria-label="Get started">
<tr>
<td align="center" width="360">
  <a href="#quick-start">
    <img src="build/icon.png" height="64" alt="" /><br />
    <strong>Run it locally</strong>
  </a><br />
  <sub>Node 20 · pnpm · a C toolchain</sub>
</td>
<td align="center" width="360">
  <a href="https://github.com/madeinusmate/altair-finance/issues">
    <img src="https://cdn.simpleicons.org/github/181717" height="42" alt="" /><br />
    <strong>Open an issue</strong>
  </a><br />
  <sub>Bugs, ideas, and questions about the books</sub>
</td>
</tr>
</table>

<br />

</div>

---

Altair is personal finance for people who want the ledger on the Mac in front of them. Net worth, transactions, and budgets live in an encrypted SQLite file. The window and the `altair` command both talk to one local server at `127.0.0.1`. You choose the passphrase. A backup is an encrypted zip you keep.

`pnpm dev` runs the app at `http://127.0.0.1:8527`. `pnpm dev:electron` opens the desktop window on a Next.js dev server, so saves show up without a production build. That local server is how Altair is meant to run.

## Quick start

Node.js 20. The package manager is pnpm 8.15.9, pinned in `package.json`. `better-sqlite3-multiple-ciphers` compiles a native module, so you need a C toolchain (on macOS, the Xcode command line tools).

```bash
pnpm install
pnpm dev
```

The first launch asks you to create a passphrase and open a new set of books. After that, the numbers live on this computer: balances, the month's spending, and the budgets you set. A wrong passphrase and a file that cannot be opened look the same to the client.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` runs the Node test runner. GitHub Actions runs the same four commands on every push and pull request.

## Features

- **Dashboard.** Net worth in each currency, and how it moved. Spending against the previous period, income and expenses, cash flow, savings rate, runway, investment performance, and the month's budgets.
- **Accounts.** Balance, transaction, and investment accounts, each an asset or a liability, with an icon. Currencies are HKD, USD, SGD, EUR, GBP, and CHF. Totals across currencies use a cached USD rate from [open.er-api.com](https://open.er-api.com).
- **Transactions and transfers.** Enter them by hand, or bring them in from a file. Rename a category and it keeps its identity.
- **Budget.** One amount per category, per month. Spending on the Budget page is that month, so March stays in March.
- **Payees.** A name, an icon, and a merge when two names are the same payee.
- **Rules on this computer.** A missing category on import can be filled from a rule stored in the books, matched on the description. Changing a category remembers that description. Nothing is sent to a classifier.
- **CSV.** Review the rows, then import. A file that was already imported is skipped.
- **PDF statements.** Read on this computer. You review the rows, then import.
- **Backup.** Export is an encrypted zip of the books. Import replaces the open file with a backup. Deleting the books, deleting an account, or exporting asks the person at the Mac to confirm in a system dialog. The calling program cannot answer it.
- **Agent grant.** On macOS, one grant lets the `altair` command use the books that are already open. The passphrase stays in the keychain.

## Desktop app

The packaged app is a macOS build for Apple Silicon: a window on your machine, and the books in an encrypted file under your account.

```bash
pnpm dev:electron
pnpm package:mac
```

`pnpm package:mac` writes a `.dmg` under `dist/`. Without an Apple Developer ID, Gatekeeper warns the first time you open that build. `scripts/fix-app-signature.sh` runs after the package step and ad-hoc signs the app you just built so you can launch it on the same Mac. That signature is for an app you compiled. It is not a way to open somebody else's unsigned app. `scripts/remove-quarantine.sh` is the same kind of local helper.

Electron generates a random token on each launch. Every `/api` request from the window must present it. The token is injected into the app window. The server stays on `127.0.0.1`. The desktop app binds a loopback port starting at `8528`.

## The altair command

Point a script or an agent at the open books. The passphrase stays on the Mac. An agent grant installs `altair` and starts the books owner at login. Quitting the window leaves the owner running for that login session. The command talks to the same routes the window uses. The books file stays with the owner.

The command used to be `netly`. An existing install keeps its books: the app still opens `~/Library/Application Support/Netly` when that folder has the database or the agent grant and `Application Support/Altair` does not, and it still opens `netly.db` when `altair.db` is not there. The macOS keychain items and `NETLY_*` environment variables are read the same way. Reinstall the command so `/usr/local/bin/altair` points at this app, and remove `/usr/local/bin/netly`.

`altair status` prints JSON. `altair help` lists the commands: accounts, transactions, transfers, budgets, categories, imports, dashboard figures, and export. Delete, account delete, and export still raise the macOS confirm dialog.

The grant, the keychain copy of the passphrase, and the confirm dialog are macOS. The dev server itself runs wherever Node 20 and the native module build.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js on `127.0.0.1:8527` |
| `pnpm dev:fresh` | Dev server with a fresh books file |
| `pnpm dev:electron` | Desktop window on the Next.js dev server |
| `pnpm test` | Node test runner |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm build` | Production Next.js build |
| `pnpm package:mac` | macOS Apple Silicon `.dmg` |
| `pnpm reset-db` | Delete the local dev books file |

## Project layout

```
app/            Next.js pages and /api routes
components/     Interface
lib/            Books, insights, import, PDF parsing
electron/       Desktop shell, keychain, books owner
cli/            altair command
scripts/        Dev server, packaging, signature fix
tests/          Node test runner
public/         Static assets
build/          macOS app icon
```

Product language is in [CONTEXT.md](CONTEXT.md). The encrypted ledger is the books. The secret you type is a passphrase. The local server that holds the books open is the books owner.

## Stack

[Next.js 16](https://nextjs.org) and [React 19](https://react.dev), in an [Electron](https://www.electronjs.org) window. The books are SQLite through [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers) and [SQLCipher](https://www.zetetic.net/sqlcipher/), queried with [Drizzle](https://orm.drizzle.team). The interface is [Tailwind CSS](https://tailwindcss.com) and [Radix](https://www.radix-ui.com). Charts are [Recharts](https://recharts.org) and [Nivo](https://nivo.rocks). Tests are the Node.js test runner. Lint is [ESLint](https://eslint.org).

Settings lists the libraries the app ships with, and the same list is in `lib/credits.ts`.

## FAQ

<details>
<summary><strong>Do I need an account?</strong></summary>

<br />

You need a passphrase for the books on this computer. Altair has no signup server and no cloud copy of the ledger.

</details>

<details>
<summary><strong>Where do the books live?</strong></summary>

<br />

In an encrypted SQLite file on this Mac. A backup is an encrypted zip you download yourself. Importing a backup replaces the open file.

</details>

<details>
<summary><strong>Can I connect a bank?</strong></summary>

<br />

You create accounts by hand. Transactions come from what you type, a CSV, a PDF, or a backup of the books.

</details>

<details>
<summary><strong>Does a PDF leave this computer?</strong></summary>

<br />

No. A PDF statement is read on this computer. The file stays on this machine.

</details>

<details>
<summary><strong>Are the exchange rates live?</strong></summary>

<br />

Cross-currency totals use USD rates from open.er-api.com, stored with the books. A snapshot older than 24 hours is marked stale. Amounts you entered stay in the account's own currency.

</details>

<details>
<summary><strong>Which machines can run the packaged app?</strong></summary>

<br />

`pnpm package:mac` builds for macOS on Apple Silicon. The dev server is the Next.js app on `127.0.0.1`, and it runs wherever Node 20 can build the native module. The agent grant, the keychain, and the confirm dialog are macOS.

</details>

<details>
<summary><strong>How do I report a security issue?</strong></summary>

<br />

Use a private advisory, described in [SECURITY.md](SECURITY.md). Leave passphrases, API tokens, and `.env.local` out of issues and pull requests.

</details>

## Star history

<a href="https://www.star-history.com/?repos=madeinusmate%2Faltair-finance&amp;type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=madeinusmate/altair-finance&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=madeinusmate/altair-finance&amp;type=date" />
    <img alt="GitHub star history for Altair" src="https://api.star-history.com/chart?repos=madeinusmate/altair-finance&amp;type=date" />
  </picture>
</a>

## Caveats

Read these before you trust Altair with a year of transactions.

The supported way to run Altair is the Electron app, with the server bound to `127.0.0.1`. Do not publish port `8527` or `8528`.

A person who can use an unlocked session on this macOS account can use the open books. The passphrase rate limit applies to unlock, status, export, delete, and import. It does not cover an already unlocked window.

Exchange rates are a convenience for totals. They are a cached snapshot, not a quote, and they are not stored on the transaction. Amounts you entered stay in the account's own currency.

## Trademarks

Payee icons include other companies' marks. Vector paths in `lib/payees/logos.ts` are [Simple Icons](https://simpleicons.org) paths under CC0-1.0. Raster images in `lib/payees/images.ts` were fetched from each brand's own domain. Those names and images are trademarks of their owners. Altair uses them so a payee is recognizable. The MIT license covers original code in this repository. It does not grant any right to those marks, and using them here does not mean the owner sponsors or endorses Altair.

## License

Original code is copyright Stefano Cantu and released under the [MIT License](LICENSE).

Third-party libraries keep their own licenses. Settings → Credits names the ones the interface uses.

`package.json` is marked `"private": true`, so this application stays off npm.

## Contributing

[Open an issue](https://github.com/madeinusmate/altair-finance/issues) to report a bug or suggest a change, or send a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` run on every pull request. Report vulnerabilities through [SECURITY.md](SECURITY.md).
