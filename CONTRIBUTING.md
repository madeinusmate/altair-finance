# Contributing

Thanks for looking at Netly. Issues and pull requests are welcome once the repository is public.

## Setup

Use pnpm. The version is pinned in `package.json`.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Put provider secrets only in `.env.local`. That file is gitignored. `.env.example` must stay free of real keys.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

GitHub Actions runs the same four commands. If you change the OAuth allowlist, update `lib/app-ports.ts` and `oauth-relay/api/redirect-allowlist.ts` together and extend `tests/oauth-redirect-allowlist.test.ts`.

## Security-sensitive changes

- Keep the Next server on `127.0.0.1`.
- Do not log access tokens, refresh tokens, passphrases, or the API token.
- Do not send the passphrase, or a hash of it, to a bank provider. Use `getProviderUserId`.
- Bank authentication stays in the separate Electron window. Do not navigate the main window to a provider.
- Import uploads must keep using a random temp directory and a fixed file name inside it.

If you find a vulnerability, follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
