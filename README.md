# Netly

Netly is an open-source desktop app for personal finance. It is an Electron shell around a local Next.js server. Your books live in a SQLCipher database on this computer, unlocked by a passphrase you choose. The app does not ship with an account server, and it is not meant to be deployed as a website.

## Security model

- The Next.js server binds to `127.0.0.1` only.
- Electron generates a random token on each launch. Every `/api` request must present it. The token is injected into the app window.
- The database file is encrypted. The passphrase is checked with a shared rate limit on unlock, status, export, delete, and import.
- A wrong passphrase and a file that cannot be opened look the same to the client (`locked`). The status endpoint does not say whether the file is corrupt.
- The main window stays on the local app origin.

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Build from source

Requirements: Node.js 20, pnpm 8.15.9, and a C toolchain so `better-sqlite3-multiple-ciphers` can build.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` serves the web UI on `http://127.0.0.1:8527` for local development. Do not publish that port. The desktop app binds another loopback port starting at `8528`.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev:electron
```

`pnpm package:mac` builds a macOS app. An unsigned local build needs an ad-hoc signature. Read [docs/macos-unsigned-builds.md](docs/macos-unsigned-builds.md) before using the signing scripts. Those scripts are for an app you just built. They are not a way to run somebody else's unsigned app.

Accounts are created by hand. Transactions come from entry, CSV, PDF, or a database backup. Open banking is not part of this version.

## License

MIT. See [LICENSE](LICENSE). `package.json` already declared MIT. There was no `LICENSE` file in the tree before this was added, so confirm that the copyright line matches what you want to publish.
