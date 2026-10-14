# Open banking

Finverse and Plaid are not in this version of Netly. They were flaky, and the connect flow, provider SDKs, and OAuth relay have been removed. Accounts you linked before this change stay in the database as ordinary accounts. Their transactions stay too. You edit balances and transactions the same way you edit an account you created by hand. The app does not call the bank.

The `open_banking_tokens` and `open_banking_client_tokens` tables, the `user_settings.install_id` column, and the `metadata` JSON on accounts and transactions are left in place. Nothing in the app reads the token tables.

CSV import, PDF statement import, and database backup import are unchanged.

## Restore later

The last commit that still contains the integration is `5ba28fb` (`Prepare the desktop app for a public repository`). That tree has:

- `app/api/open-banking/**`
- `app/(app)/accounts/connect/page.tsx`
- `components/open-banking/**`
- `lib/finverse-*.ts`, `lib/plaid-*.ts`, `lib/provider-user-id.ts`, `lib/local-app-url.ts`, `lib/app-ports.ts`
- `public/plaid-link.html`
- `oauth-relay/` (including `vercel.json`)
- the Electron bank window in `electron/main.ts` and `electron/preload.ts`
- the `react-plaid-link` dependency

To bring it back, revert the commit that removed open banking, or check those paths out of `5ba28fb` and reinstall `react-plaid-link`. You would also need to host `oauth-relay` again and put provider credentials in `.env.local`.
