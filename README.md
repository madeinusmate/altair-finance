<div align="center">

# Netly

### Personal finance. The books stay on this computer.

**A macOS app for accounts, transactions, and budgets. The ledger is a SQLCipher file on this Mac, unlocked by a passphrase you choose. There is no account server.**

[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#quick-start)
[![pnpm](https://img.shields.io/badge/pnpm-8.15-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-087EA4?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Electron](https://img.shields.io/badge/Electron-40-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org)
[![Tests](https://img.shields.io/badge/tests-CI-6E9F18?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/madeinusmate/netly/actions/workflows/ci.yml)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLCipher](https://img.shields.io/badge/SQLCipher-encrypted%20SQLite-0F4C81?style=flat-square)](https://www.zetetic.net/sqlcipher/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black)](https://orm.drizzle.team)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

**[Issues](https://github.com/madeinusmate/netly/issues) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)**

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
  <a href="https://github.com/madeinusmate/netly/issues">
    <img src="https://cdn.simpleicons.org/github/181717" height="42" alt="" /><br />
    <strong>Open an issue</strong>
  </a><br />
  <sub>Bugs · Ideas · A books question</sub>
</td>
</tr>
</table>

<br />

</div>

---

Netly is an Electron shell around a Next.js server that binds to `127.0.0.1`. Your books live in an encrypted SQLite file. The window and the `netly` command both talk to that one local server.

`pnpm dev` is the interface for development, on `http://127.0.0.1:8527`. The desktop app is `pnpm dev:electron`. Hosting this Next.js app as a public website is not a supported configuration.

## Quick start

Node.js 20. The package manager is pnpm 8.15.9, pinned in `package.json`. `better-sqlite3-multiple-ciphers` compiles a native module, so you need a C toolchain (on macOS, the Xcode command line tools).

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Leave `.env.local` on your machine. It is gitignored. `.env.example` is the template, and it ships with an empty `OPENAI_API_KEY`.

The first launch asks you to create a passphrase and open a new set of books. A wrong passphrase and a file that cannot be opened look the same to the client.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` runs the Node test runner. GitHub Actions runs the same four commands on every push and pull request.

## Features

- **Dashboard.** Net worth by currency, net worth over time, spending against the previous period, income and expenses, cash flow, savings rate and runway, investment performance, and the month's budgets.
- **Accounts.** Balance, transaction, and investment accounts, each an asset or a liability, with an icon. Currencies are HKD, USD, SGD, EUR, and GBP. Totals across currencies use a cached USD rate from [open.er-api.com](https://open.er-api.com).
- **Transactions and transfers.** Posted by hand, or brought in from a file. Categories keep their identity when you rename them.
- **Budget.** One budget per category per month. Spending on the Budget page is that month, not a rolling window.
- **Payees.** A name, an icon, and a merge when two names are the same payee.
- **Rules on this computer.** A missing category on import can be filled from a rule stored in the books, matched on the description. Changing a category remembers that description. Nothing is sent to a classifier.
- **CSV.** Review the rows, then import. A file that was already imported is skipped.
- **PDF statements.** Parsed on this computer. A checkbox can send that one file to OpenAI instead, and only if you set `OPENAI_API_KEY` yourself. Netly does not include a key.
- **Backup.** Export is an encrypted zip of the books. Import replaces the open file with a backup. Deleting the books, deleting an account, or exporting asks the person at the Mac to confirm in a system dialog. The calling program cannot answer it.
- **Agent grant.** On macOS, one grant lets the `netly` command use the books that are already open. The command never receives the passphrase.

## Desktop app

The packaged app is macOS, Apple Silicon.

```bash
pnpm dev:electron
pnpm package:mac
```

`pnpm package:mac` writes a `.dmg` under `dist/`. Without an Apple Developer ID, Gatekeeper warns the first time you open that build. `scripts/fix-app-signature.sh` runs after the package step and ad-hoc signs the app you just built so you can launch it on the same Mac. Read [docs/macos-unsigned-builds.md](docs/macos-unsigned-builds.md) before using the signing scripts. They are for an app you compiled. They are not a way to open somebody else's unsigned app.

Electron generates a random token on each launch. Every `/api` request from the window must present it. The token is injected into the app window. The server stays on `127.0.0.1`. The desktop app binds a loopback port starting at `8528`.

## The netly command

An agent grant installs `netly` and starts the books owner at login. Quitting the window leaves the owner running for that login session. The command talks to the same routes the window uses. It does not open the books file itself.

`netly status` prints JSON. `netly help` lists the commands: accounts, transactions, transfers, budgets, categories, imports, dashboard figures, and export. Delete, account delete, and export still raise the macOS confirm dialog.

The grant, the keychain copy of the passphrase, and the confirm dialog are macOS. The dev server itself runs wherever Node 20 and the native module build.

## Optional cloud parser

Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY` only if you want the PDF checkbox. Checking the box sends that file off this computer. Leave the key empty and statement parsing stays on device.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js on `127.0.0.1:8527` |
| `pnpm dev:fresh` | Dev server with a fresh books file |
| `pnpm dev:electron` | Electron shell around the local server |
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
cli/            netly command
scripts/        Dev server, packaging, signature fix
tests/          Node test runner
docs/adr/       Decisions that should stay put
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

You need a passphrase for the books on this computer. Netly has no signup server and no cloud copy of the ledger.

</details>

<details>
<summary><strong>Where do the books live?</strong></summary>

<br />

In an encrypted SQLite file on this Mac. A backup is an encrypted zip you download yourself. Importing a backup replaces the open file.

</details>

<details>
<summary><strong>Can I connect a bank?</strong></summary>

<br />

Accounts and transactions come from entry, CSV, PDF, or a backup. Bank connect is not in this tree. See [docs/open-banking.md](docs/open-banking.md).

</details>

<details>
<summary><strong>Does a PDF leave this computer?</strong></summary>

<br />

The default parser runs locally. The upload checkbox sends that file to OpenAI, and only when `OPENAI_API_KEY` is set in `.env.local`. Netly does not ship a key.

</details>

<details>
<summary><strong>Are the exchange rates live?</strong></summary>

<br />

Cross-currency totals use USD rates from open.er-api.com, stored with the books. A snapshot older than 24 hours is marked stale. Amounts you entered stay in the account's own currency.

</details>

<details>
<summary><strong>Which machines can run the packaged app?</strong></summary>

<br />

`pnpm package:mac` builds for macOS Apple Silicon. The dev server is the Next.js app on `127.0.0.1`. The agent grant, keychain, and confirm dialog are macOS.

</details>

<details>
<summary><strong>How do I report a security issue?</strong></summary>

<br />

Use a private advisory, described in [SECURITY.md](SECURITY.md). Leave passphrases, API tokens, and `.env.local` out of issues and pull requests.

</details>

## Star history

<a href="https://www.star-history.com/?repos=madeinusmate%2Fnetly&amp;type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=madeinusmate/netly&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=madeinusmate/netly&amp;type=date" />
    <img alt="GitHub star history for Netly" src="https://api.star-history.com/chart?repos=madeinusmate/netly&amp;type=date" />
  </picture>
</a>

## Caveats

The supported way to run Netly is the Electron app, with the server bound to `127.0.0.1`. Do not publish port `8527` or `8528`.

A person who can use an unlocked session on this macOS account can use the open books. The passphrase rate limit applies to unlock, status, export, delete, and import. It does not protect an already unlocked window.

Exchange rates are a convenience for totals. They are not a quote, and they are not stored as part of a transaction.

## License

Original code is copyright Stefano Cantu and released under the [MIT License](LICENSE).

Third-party libraries keep their own licenses. Settings → Credits names the ones the interface uses.

`package.json` is marked `"private": true` so this application is not published to npm.

## Contributing

[Open an issue](https://github.com/madeinusmate/netly/issues) to report a bug or suggest a change, or send a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` run on every pull request. Report vulnerabilities through [SECURITY.md](SECURITY.md).
