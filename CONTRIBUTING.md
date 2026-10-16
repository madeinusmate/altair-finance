# Contributing

Issues and pull requests are welcome.

## Set up

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Node.js 20. The package manager is pnpm 8.15.9, pinned in `package.json`. `better-sqlite3-multiple-ciphers` needs a C toolchain.

Leave `.env.local` on your machine. It is gitignored. `.env.example` is the template and must stay free of real keys.

`pnpm test` runs the Node test runner. `pnpm typecheck` runs `tsc --noEmit`. `pnpm lint` runs ESLint.

## What to touch

- Pages and `/api` routes live in `app/`.
- Product language is in [CONTEXT.md](CONTEXT.md). The encrypted ledger is the books. The secret you type is a passphrase. The local server that holds the books open is the books owner.
- Libraries shown in Settings are listed in `lib/credits.ts`. If a change adds or drops one the interface uses, update that file.

## Security-sensitive changes

- Keep the Next server on `127.0.0.1`.
- Do not log passphrases or the API token.
- Import uploads must keep using a random temp directory and a fixed file name inside it.
- A wrong passphrase and a file that cannot be opened stay indistinguishable to the client.

## Pull requests

Open a pull request against `main`. Describe what changed and how you checked it. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` run on every pull request.

If you find a vulnerability, follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
