# Netly

Netly is an open-source desktop app for personal finance. It is an Electron shell around a local Next.js server. Your books live in a SQLCipher database on this computer, unlocked by a passphrase you choose. The app does not ship with an account server, and it is not meant to be deployed as a website.

## Security model

- The Next.js server binds to `127.0.0.1` only.
- Electron generates a random token on each launch. Every `/api` request must present it. The token is injected into the app window and is not given to bank windows.
- The database file is encrypted. The passphrase is checked with a shared rate limit on unlock, status, export, delete, and import.
- A wrong passphrase and a file that cannot be opened look the same to the client (`locked`). The status endpoint does not say whether the file is corrupt.
- Bank sign-in opens in a separate Electron window with no preload script, no API token, and no clipboard bridge. The main window is not allowed to navigate to the bank.
- Finverse and Plaid receive a random install id stored in the encrypted database. They do not receive the passphrase or a hash of it.
- The OAuth relay only redirects back to `http://127.0.0.1` or `http://localhost`, on the dev port `8527` or an app port from `8528` through `8535`, and only to `/accounts/connect`.

Report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Build from source

Requirements: Node.js 20, pnpm 8.15.9, and a C toolchain so `better-sqlite3-multiple-ciphers` can build.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` serves the web UI on `http://127.0.0.1:8527` for local development. Do not publish that port. The desktop app uses another loopback port in `8528`–`8535` and does not need you to open anything on the LAN.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev:electron
```

`pnpm package:mac` builds a macOS app. An unsigned local build needs an ad-hoc signature. Read [docs/macos-unsigned-builds.md](docs/macos-unsigned-builds.md) before using the signing scripts. Those scripts are for an app you just built. They are not a way to run somebody else's unsigned app.

## Bank connect

Open banking is optional. Leave `NEXT_PUBLIC_OPEN_BANKING_ENABLED` unset or `false` if you do not want it.

Finverse requires an HTTPS redirect URL. The desktop app is loopback-only, so the callback is a tiny public function in [`oauth-relay/`](oauth-relay/). You host that function yourself, set `NEXT_PUBLIC_OAUTH_RELAY_URL` to its origin, and put your provider credentials in `.env.local`. The relay stores nothing. It reads the loopback URL the app placed in `state` and redirects only when that URL is on the allowlist. The app sends the port it actually bound.

Plaid Link, inside the desktop app, runs in the same separate bank window.

Existing bank connections that were created before the install id change need to be connected again. Token refresh now sends the install id, not a hash of the passphrase.

## License

MIT. See [LICENSE](LICENSE). `package.json` already declared MIT. There was no `LICENSE` file in the tree before this was added, so confirm that the copyright line matches what you want to publish.
