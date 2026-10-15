# Remove bank sync

## Goal

Altair no longer has a bank-connect feature, and a future launch does not keep the pieces that would turn it back on. Accounts that were linked before stay ordinary local accounts. Their transactions stay. Token tables are dropped. The app does not call Finverse or Plaid. There is no reachable connect page.

## Current behavior

The live routes and UI are already gone. This was an incomplete teardown, not a working integration.

`README.md` says open banking is not part of this version and points at `docs/open-banking.md` "if you need to bring that integration back from git history." That doc says Finverse and Plaid were removed, names commit `eb73630` and the previous tree `5ba28fb`, and lists how to restore `app/api/open-banking/**`, `app/(app)/accounts/connect/page.tsx`, `components/open-banking/**`, `lib/finverse-*.ts`, `lib/plaid-*.ts`, `lib/provider-user-id.ts`, `oauth-relay/`, the Electron bank window, and `react-plaid-link`. Those paths are not in the working tree. A search of `app/`, `components/`, `lib/`, `electron/`, and `public/` finds no Finverse or Plaid client, no connect page, and no `api.prod.finverse.net` call.

What is still here:

- `package.json` depends on `react-plaid-link` `4.1.1`. No source file imports it.
- `lib/db/schema.ts` still declares `openBankingClientTokens` (`open_banking_client_tokens`: `access_token`, `expires_at`) and `openBankingTokens` (`open_banking_tokens`: `access_token`, `refresh_token`, `login_identity_id`). The comment says the tables are kept so old files open and that nothing reads them.
- `lib/db/index.ts` still creates those tables. `runMigrations` (called from `getDb`) has a block around the "Open banking tables stay in place" comment that `CREATE TABLE`s both if missing. `initializeDb` creates them again in the fresh-database script, and the `if (!isFreshDatabase)` branch creates them a third time. So a new database, and any old database that lacked the tables, still receives empty token tables.
- `user_settings.install_id` is added by `ensureInstallIdColumn` and filled with `crypto.randomUUID()` during `initializeDb` when the row's `install_id` is null. The Drizzle column is `userSettings.installId`. Nothing in the app reads it after it is written. It is not a hash of the passphrase.
- The only hash of the encryption key in current code is inside `getDb`: SHA-256, first 16 hex characters, used as an in-memory `connectionCache` key. It is not sent anywhere. Do not confuse it with the old provider user id, and do not log it.
- `accounts.metadata` and `transactions.metadata` are optional text columns, created by ALTER in both migration copies and on the fresh `CREATE TABLE`. `app/api/accounts/route.ts` `POST` copies `body.metadata` onto the new account. `PUT` does not take metadata. No UI reads or displays the JSON. Transaction routes do not write `transactions.metadata`. Old provider payloads can still sit in those columns.
- `.env.example` has `OPENAI_API_KEY` only. It does not list Finverse or Plaid.
- A gitignored local `.env` (`.gitignore` ignores `.env` and `.env.*`) still defines `FINVERSE_CLIENT_ID`, `FINVERSE_SECRET`, `FINVERSE_APP_ID`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV`. No application source reads those names. They are leftover credentials on disk. Do not copy the values into docs, commits, or logs.

`docs/open-banking.md` is the main leak of intent: it tells the next person to revert a commit and host the OAuth relay again.

## Proposed design

Delete the leftover integration. Do not add a stub connect screen. Do not add redirects that advertise the old URL. Next.js will 404 `/accounts/connect` and `/api/open-banking/*` because the files are absent; leave it that way.

### Code and dependencies

- Remove `react-plaid-link` with pnpm (`pnpm remove react-plaid-link`) so `package.json` and `pnpm-lock.yaml` both update.
- Remove `openBankingClientTokens`, `openBankingTokens`, and their exported types from `lib/db/schema.ts`.
- Remove every `CREATE TABLE` for `open_banking_client_tokens` and `open_banking_tokens` from `runMigrations` and from both the fresh script and the existing-database branch of `initializeDb`.
- Replace those blocks with one `DROP TABLE IF EXISTS` for each token table, in `runMigrations`, so files that already have the tables lose them on next open. Repeat the DROP in the `initializeDb` existing-database branch so a caller that only initializes also drops them. `DROP TABLE` deletes stored access tokens and refresh tokens. That is the point.
- Stop assigning `install_id`. Delete the `UPDATE user_settings SET install_id = ?` backfill in `initializeDb`. Leave the column on `user_settings` and on the Drizzle schema so existing files and `SELECT *` shapes do not need a table rebuild. Do not read it and do not send it. New databases may keep the column nullable and null.
- Stop accepting `metadata` in `POST /api/accounts`. Ignore the field. Do not null out `accounts.metadata` or `transactions.metadata` on existing rows. Those JSON blobs stay in the local file, unread. Wiping them is out of scope because this change must not touch account or transaction rows.
- Do not log token-table contents before dropping them.

### Docs and env

- Replace `docs/open-banking.md` with a short note: bank connect is not part of Altair, token tables are dropped on startup, existing accounts and transactions remain and are edited like any other local account, and there is no supported way to turn Finverse or Plaid back on from this tree. Delete the restore steps, commit ids, and the relay instructions.
- In `README.md`, remove the sentence that points at that doc as a way to bring the integration back. State that accounts are created by hand and that transactions come from entry, CSV, PDF, or a database backup.
- Do not add `FINVERSE_*` or `PLAID_*` to `.env.example`.
- Delete those six keys from the local gitignored `.env` if they are still present. Do not commit `.env`. Revoke the Finverse client in the provider dashboard; the secret has been sitting in that file. Do not print the secret while doing this.

### What must remain

Rows in `accounts`, `transactions`, `transfers`, `balance_history`, and `investment_history` stay, including rows that were created by an old sync. The user edits them through the existing account and transaction screens. `import_id` links stay. This change does not run `DELETE` against those tables.

## Work breakdown

1. `pnpm remove react-plaid-link`.
2. Edit `lib/db/schema.ts`: drop the two token tables and their types.
3. Edit `lib/db/index.ts`: remove all three create sites, add the drops, remove the `install_id` backfill, keep `ensureInstallIdColumn` so old files that predate the column still open.
4. Edit `app/api/accounts/route.ts` `POST` so `metadata` from the body is not written. Leave the column in the schema.
5. Replace `docs/open-banking.md` and adjust the open-banking sentence in `README.md`.
6. Remove `FINVERSE_*` and `PLAID_*` from the local `.env`. Revoke the Finverse client out of band.
7. Search the tree for `react-plaid-link`, `open_banking`, `finverse`, `plaid`, `accounts/connect`, and `install_id` and confirm the only remaining hits are the column that is no longer written, the metadata columns, and the new doc that says the feature is gone.

## Data migration

`SCHEMA_VERSION` stays `1`. Migrations stay imperative ALTERs and drops in `lib/db/index.ts`, not a version bump.

On next successful open of an existing database, `runMigrations` runs:

```sql
DROP TABLE IF EXISTS open_banking_tokens;
DROP TABLE IF EXISTS open_banking_client_tokens;
```

Fresh databases never create those tables. No other table is rewritten. `install_id` values already stored stay in place and unused. `accounts.metadata` and `transactions.metadata` stay as stored, including old provider JSON.

If Drizzle schema and the SQLite file disagree during a partial edit, `getDb` will throw when it selects a removed column. Land the schema edit and the DROP in the same change. Drop first inside `runMigrations`, which runs before `drizzle()` is constructed in `getDb`.

## Privacy

Token tables held provider access tokens and refresh tokens. Dropping them removes those secrets from the SQLCipher file. Account and transaction rows, including any provider JSON in `metadata`, never leave the machine in this change. No Finverse or Plaid host is called, because no caller remains.

`getDb`'s in-memory key hash stays process-local. Do not persist it and do not add it to a request.

The Finverse secret in the local `.env` is not in git. Revoke it anyway. After the keys are removed from `.env`, the Electron child process (which inherits `process.env`) no longer sees them.

PDF parsing and FX (`lib/fx.ts`, `https://open.er-api.com`) are separate. This plan does not change them.

## Risks and edge cases

- `DROP TABLE` is permanent for anyone who wanted the raw tokens. The product decision is that those tokens must not remain. Accounts and transactions are not in those tables.
- A database backup imported through `POST /api/app/import` can contain the token tables. `runMigrations` on the next `getDb` drops them again. Confirm `lib/db/import-utils.ts` does not special-case those tables; the generic open path is enough. If import restores a file and then opens it, the drop runs. Do not skip migrations on import.
- Leaving `metadata` means a linked account can still carry a provider account id in a column nothing displays. That is local residue, not a network call. A later cleanup can null known keys. Do not do it here, and do not delete the account.
- Leaving `install_id` avoids a `user_settings` rebuild. The risk is someone later treating it as a cloud user id. The column stays null for new users and unread for old ones.
- `pnpm remove` must be the edit to the lockfile. Do not hand-edit `pnpm-lock.yaml`.
- Do not reintroduce `/accounts/connect` as a friendly empty state that links to a provider.

## Test plan

- `pnpm test` (existing `tests/import-upload-path.test.ts`, `tests/auth-verify-rate-limit.test.ts`, `tests/local-api-token.test.ts`) still passes.
- `pnpm typecheck` passes with the schema exports removed. Fix any import of `OpenBankingToken` or `openBankingTokens`.
- Open an existing database and confirm `sqlite_master` has no `open_banking_tokens` or `open_banking_client_tokens`, and that account and transaction counts are unchanged.
- Create a fresh database and confirm those tables are not created and `user_settings.install_id` stays null.
- `POST /api/accounts` with a `metadata` object stores null for that column. The account row exists.
- `GET /accounts/connect` and `POST /api/open-banking/link` (or any path under that prefix) 404.
- Repo search shows no `react-plaid-link`, no `api.prod.finverse.net`, and no restore instructions.
- The local `.env` no longer contains `FINVERSE_` or `PLAID_` names. Confirm with a name search, not by printing values.

## Out of scope

- Deleting or rewriting transactions, balances, or accounts that came from an old sync.
- Clearing `metadata` JSON.
- Dropping the `install_id` or `metadata` columns.
- PDF parsing, categorization, and duplicate blocking.
- FX rate fetches.
- Rotating anything other than the leftover Finverse and Plaid credentials.

## Rough size

S. The network clients are already gone. The work is removing a dependency, dropping two tables, ignoring one request field, and deleting the restore guide.
