# Block duplicate imports

## Goal

Importing a CSV, a PDF statement, or the same file again does not add a second copy of a transaction, transfer, or balance snapshot that is already in the local ledger. The server skips those rows. In the review table the person can include a single skipped row on purpose (two identical coffees on the same day, or a snapshot they really want twice). Spending and balances are not double-counted by a retry or a re-import. The check runs on this machine against the SQLCipher file.

## Current behavior

There are two client checks and one file-hash warning. None of them stop `POST /api/import/transactions` or `POST /api/import/balances` from inserting.

CSV review lives in `hooks/use-import-wizard.ts`, used by `app/(app)/settings/import/page.tsx`. `buildTransactionKey` is `` `${accountId}|${date}|${amount}|${description.trim().toLowerCase()}` ``. Transfers use `` `${fromId}|${toId}|${date}|${fromAmount}|${toAmount}` ``. Balances and investment snapshots share `buildBalanceKey`: `` `${accountId}|${date}|${balance}` ``. `applyTransactionDuplicateFlag` and `applyBalanceDuplicateFlag` set `duplicate: true` and push the warning `Possible duplicate`. They do not remove the row. `getTransactionSummary` counts `valid` as `total - invalid`, so a duplicate with no errors is still valid. `importRows` posts every row with `errors.length === 0`. The review step copy says "Warnings will not block the import."

Date keys go through `getDateKey`, which uses `toISOString().split("T")[0]`. Import routes store `new Date(row.date)` for a `YYYY-MM-DD` string, which is UTC midnight, and Drizzle's integer timestamp mode stores unix seconds. The UTC date usually matches. Do not build the new fingerprint with `toISOString()` on a local `Date`, or a user east or west of UTC will miss duplicates around midnight.

PDF review in `components/pdf-import/pdf-statement-import.tsx` uses the same transaction and transfer strings. On a match it sets `excluded: true` and the confirm dialog says those rows will be excluded. `handleToggleExclude` can turn exclusion off. `handleImport` posts rows with `errors.length === 0 && !row.excluded`. The API never sees the flag, so any client that posts the duplicate inserts it.

File identity is `imports.file_hash`, not unique. `lib/db/index.ts` creates `CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON imports(file_hash)` in `runMigrations` and again in `initializeDb`. `lib/db/schema.ts` `imports.fileHash` is a plain `text` column. Both import routes look up `eq(schema.imports.fileHash, fileHash)` and, on a hit, set `isDuplicate = true` and insert another `imports` row plus the ledger rows anyway. The CSV wizard only `console.warn`s when `result.isDuplicate` is true. There is no toast.

CSV hashes are not the file bytes. `lib/csv/file-hash.ts` `calculateFileHash` hashes `filename|rowCount|JSON.stringify(firstRow)|JSON.stringify(lastRow)`. Renaming the file, editing a middle row, or dropping the first or last valid row changes the hash. The same rows under a new name do not match. Paste imports use a synthetic name like `Pasted CSV (N rows)`. The hash is computed in the browser and sent by the client. Omitting `filename` or `fileHash` skips the check entirely (`app/api/import/transactions/route.ts` around the `if (filename && fileHash)` block). The same pattern is in `app/api/import/balances/route.ts`.

PDF hashes are SHA-256 of the bytes in `lib/pdf/file-hash.ts` `calculatePdfHash`, still computed in the client and still only a warning.

Inserts are not wrapped in a SQLite transaction. A throw on row 50 leaves rows 1–49 committed and still returns an error. A retry inserts those rows again. `DELETE /api/imports/[id]` removes rows by `import_id`, which does not help a retry that created a second import id.

`components/transactions-csv-import.tsx` and `components/balances-csv-import.tsx` repeat the client warning logic. Nothing imports them. They are not a second live path, but they will drift if left behind.

`POST /api/import/accounts` already rejects duplicate account names inside the batch and against existing accounts. Leave that route alone.

`POST /api/transactions` inserts a hand-entered row with no duplicate check. A later statement import of that same row must see it, so manual creates have to store a fingerprint too.

Balance and investment history can already store two snapshots for one account and date. `app/api/dashboard/investment-performance/route.ts` even comments that it keeps the latest row per date when duplicates exist. Same account, same calendar date, same balance amount is a duplicate snapshot. A different amount on that date is a correction and must still insert.

## Proposed design

One fingerprint function, used by the review UI and enforced by the import routes. `imports.file_hash` stays an audit column. It does not decide whether a row is written.

### Shared import pipeline

This is the same order the parse and categorization plans use:

1. Parse. CSV on the client. PDF on device unless that request opted into OpenAI.
2. Categorize. Rules fill a missing category before the user reviews. The fingerprint does not include category, so a rule match does not change duplicate detection.
3. Duplicates. This plan. Mark them, exclude them from the payload by default, let the user include one row.
4. Insert. `POST /api/import/transactions` and `POST /api/import/balances` skip a row whose fingerprint is already stored, unless that row has `overrideDuplicate: true`. Skipped rows do not create categorization rules. All writes for the request run in one SQLite transaction.
5. The server stores the category it was given. It does not re-parse or re-categorize.

### Fingerprint

New `lib/import/fingerprint.ts`, safe to import from client components and route handlers (Web Crypto in the browser, `node:crypto` on the server, same hex SHA-256). No database access inside the module.

`normalizeDescription`: trim, lowercase, collapse internal whitespace to a single space. Do not strip punctuation. `STARBUCKS` and `STARBUCKS #1234` stay different.

`amountToCents`: `Math.round(Number(amount) * 100)`. Non-finite numbers do not produce a fingerprint; the existing validators already reject those rows.

`dateKey`: the `YYYY-MM-DD` string already on the review row. For a stored Drizzle timestamp (unix seconds), format with UTC `YYYY-MM-DD` (`strftime('%Y-%m-%d', date, 'unixepoch')` in SQL, or `toISOString().slice(0, 10)` only when the value is known to be that UTC midnight). Do not format with the local timezone.

Fingerprints are hex SHA-256 of a prefixed string:

- Transaction: `tx|${accountId}|${date}|${cents}|${normalizedDescription}|${type}` where `type` is `debit` or `credit`.
- Transfer: `xfer|${fromAccountId}|${toAccountId}|${date}|${fromCents}|${toCents}`.
- Balance or investment snapshot: `bal|${accountId}|${date}|${cents}`.

Including `type` is a behavior change from the CSV key, which omitted it. A charge and a refund with the same text and amount on the same day are different rows and both import. Document that in the review UI only if someone asks; do not keep the old collision.

The reversed transfer (accounts swapped) is not the same fingerprint. Do not auto-match it.

### Columns

Add a nullable `fingerprint` text column and a non-unique index on:

- `transactions`
- `transfers`
- `balance_history`
- `investment_history`

No `UNIQUE` constraint. An override must be able to insert a second row with the same fingerprint. Lookup is `WHERE fingerprint = ?`.

Also add nullable `source_fingerprint` on the same four tables. Set it once, on import, to the same value as `fingerprint`, and never update it. Manual `POST /api/transactions` sets `fingerprint` only. Re-import matches if the incoming hash equals either column. That way a later edit to the description (which recomputes `fingerprint` in `PUT /api/transactions`) does not open the original statement line for a second insert.

`PUT` recomputes `fingerprint` from the new account, date, amount, description, and type. It does not change `source_fingerprint`. Category edits do not change either hash. `PUT /api/transfers`, `PUT /api/balance-history`, and `PUT /api/investment-history` do the same for their identity fields.

### Server enforcement

In `app/api/import/transactions/route.ts` and `app/api/import/balances/route.ts`:

- Compute the fingerprint on the server from the row. Ignore any fingerprint the client sends.
- Load the set of existing `fingerprint` and `source_fingerprint` values for the accounts touched by the batch (one query per table, not one query per row).
- Walk the batch with a `seen` set. The first copy in the batch is insertable. A later row with the same fingerprint is a duplicate of the earlier row.
- If the row is a duplicate and `overrideDuplicate` is not `true`, skip it.
- If it is a duplicate and `overrideDuplicate` is `true`, insert it and record the fingerprint so a third copy in the same batch is skipped unless it too overrides.
- Validate every non-skipped row before writing. On any validation error, insert nothing.
- Write the `imports` row and the ledger rows in one `better-sqlite3` transaction (`db.transaction` from the Drizzle handle, or the underlying sqlite `transaction`). A failure rolls back the import record too.
- Still store `file_hash` when the client sends one, and still return `isDuplicate: true` when that hash was seen before. That flag is informational. Do not reject the whole file, because a previous import may have excluded rows, and the CSV hash is not stable.
- Response shape stays compatible and adds counts:

```json
{
  "success": true,
  "transactions": 3,
  "transfers": 0,
  "skippedDuplicates": 2,
  "importId": "...",
  "isDuplicate": false
}
```

Balances return `balances`, `investments`, `skippedDuplicates`, `importId`, `isDuplicate`. HTTP 200 when the only outcome is "everything skipped". HTTP 400 when a non-duplicate row is invalid, with no rows written.

`POST /api/transactions` writes `fingerprint` for the new row inside the same insert. It does not reject duplicates; hand entry can repeat on purpose. The import path is what blocks.

### Review UI

Use `lib/import/fingerprint.ts` in `hooks/use-import-wizard.ts` and `components/pdf-import/pdf-statement-import.tsx`. Delete the local `buildTransactionKey` / `buildTransferKey` / `buildBalanceKey` helpers from those files once the shared function is in place.

CSV rows gain the PDF behavior: `excluded` defaults to true when `duplicate` is true. `importRows` sends only non-excluded valid rows, and sends `overrideDuplicate: true` on a row the user explicitly included after it was marked duplicate. Changing the date, amount, description, account, or type recomputes the flag. `updateTransactionRow` must copy `excluded`, `overrideDuplicate`, `categoryTouched`, and `ruleMatch` across the revalidation it already does (today it keeps `id` and `rowNumber` only, then reapplies the duplicate flag).

PDF already excludes duplicates. Pass `overrideDuplicate: true` when the user includes an excluded duplicate (`excluded === false` while `duplicate === true`).

`app/(app)/settings/import/page.tsx` step 4 copy should say that duplicate rows are left out unless included. The summary chip already counts duplicates via `components/csv-import/csv-import-summary.tsx`. Show a line for how many will be skipped. When the response `skippedDuplicates` is greater than zero, toast that count so a raced insert is visible.

`isDuplicate` from the file hash can toast "This file was imported before" and must not be the only guard.

Delete `components/transactions-csv-import.tsx` and `components/balances-csv-import.tsx` in the same change. They are unreferenced and would keep the old warning-only behavior.

Account CSV import is unchanged.

## Work breakdown

1. Add `lib/import/fingerprint.ts` and `tests/import-fingerprint.test.ts`.
2. In `lib/db/schema.ts`, add `fingerprint` and `source_fingerprint` to `transactions`, `transfers`, `balanceHistory`, and `investmentHistory`.
3. In `lib/db/index.ts` `runMigrations` and in the existing-database branch of `initializeDb`, `ALTER TABLE` to add both columns if missing, create the indexes, and backfill. Fresh `CREATE TABLE` statements in `initializeDb` should include the columns so a new file does not depend on the ALTER.
4. Enforce skips inside a single transaction in `app/api/import/transactions/route.ts` and `app/api/import/balances/route.ts`.
5. Set `fingerprint` on create and recompute it on update in `app/api/transactions/route.ts`, `app/api/transfers/route.ts`, `app/api/balance-history/route.ts`, and `app/api/investment-history/route.ts`. Do not update `source_fingerprint` on those PUT routes.
6. Switch `hooks/use-import-wizard.ts` and `components/pdf-import/pdf-statement-import.tsx` to the shared fingerprint, exclude CSV duplicates by default, and send `overrideDuplicate` only for an included duplicate. Preserve the extra row fields in `updateTransactionRow`.
7. Adjust the review copy in `app/(app)/settings/import/page.tsx` and the success toast in both import UIs.
8. Delete the two unused CSV import components.
9. Do not change `POST /api/import/accounts`.

## Data migration

`SCHEMA_VERSION` stays `1`. Follow the existing imperative style in `lib/db/index.ts`. There are two copies of this kind of migration: `runMigrations` (called from `getDb` on every open) and the `if (!isFreshDatabase)` block inside `initializeDb`. Add the ALTERs in both, or the next existing database will miss them on one of the paths.

```sql
ALTER TABLE transactions ADD COLUMN fingerprint TEXT;
ALTER TABLE transactions ADD COLUMN source_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint ON transactions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_source_fingerprint ON transactions(source_fingerprint);
```

Repeat for `transfers`, `balance_history`, and `investment_history`.

Backfill in JavaScript with `lib/import/fingerprint.ts`, not a second SQL implementation. Read each row, format the date as UTC `YYYY-MM-DD` from the stored unix seconds, treat null descriptions as `""`, and set both `fingerprint` and `source_fingerprint` to that hash when `fingerprint` is null. Existing rows were not tagged with an import identity separate from their current fields; using the current fields for both columns is the honest backfill. A row whose description was edited before this migration cannot be tied back to the original statement line.

Do not rewrite `imports.file_hash`. Old hashes remain valid as audit values.

`DELETE /api/imports/[id]` already deletes the ledger rows for that import. Those fingerprints go away with the rows, so importing that file again is allowed. Do not add cascade logic.

## Privacy

Fingerprints are hashes of ledger fields and stay in the local SQLCipher file. No new network calls. The duplicate check must not send descriptions or amounts anywhere. File bytes for the PDF hash stay on device; this plan does not move hashing to a service.

## Risks and edge cases

- Two real purchases with the same account, day, amount, description, and type collide. The second row is skipped unless the user includes it. That is the override.
- Description edits after import recompute `fingerprint` but leave `source_fingerprint`. Re-importing the original line still skips. A brand-new transaction that matches the edited text also skips, and the user can override.
- Whitespace-only and case-only description differences match. Punctuation differences do not.
- Floating amounts match at cents. `10` and `10.001` both become `1000` cents. `10.01` does not match `10.02`.
- The same calendar date with a different balance is inserted. The same balance is skipped.
- Within one file, the second identical row is skipped unless overridden, even when the ledger did not have the first yet.
- Client-supplied `fileHash` can be omitted or lied about. That only affects the informational flag.
- A crashed import no longer leaves a partial ledger, because of the SQLite transaction.
- Transfers are not matched against a pair of debit and credit transactions. Altair stores transfers in `transfers`. Do not try to pair them in this change.
- Timezone: keep using the `YYYY-MM-DD` string from the CSV or PDF row. Backfill uses UTC on the stored unix seconds, which matches `new Date("YYYY-MM-DD")` in the import routes.
- Large histories: one query of fingerprints for the involved accounts, then an in-memory `Set`. Do not call `GET /api/transactions` for the whole ledger as the enforcement mechanism. The client may still prefetch for the preview; the server result is what counts. If the preview and the server disagree, show `skippedDuplicates`.

## Test plan

`tests/import-fingerprint.test.ts` (node:test, same runner as `pnpm test`):

- Same description with different case and extra spaces hashes equal.
- `debit` and `credit` hash different.
- `10` and `10.004` hash equal; `10` and `10.01` do not.
- Transfer direction is part of the hash.
- Null description and `""` hash equal.

Route-level cases, with a temporary database if the test harness can open one, otherwise a focused test of a pure `planImportRows(existingFingerprints, rows)` helper extracted from the route:

- Second post of the same rows inserts 0 and reports `skippedDuplicates`.
- `overrideDuplicate: true` on one of two identical new rows inserts both.
- A third identical row without the flag is skipped.
- Invalid category on a non-duplicate row inserts nothing, including rows that appeared earlier in the array.
- Balance import of the same account, date, and amount is skipped. A different amount is inserted.
- `POST /api/transactions` then import of the same account, date, amount, description, and type is skipped.
- After `PUT` changes the description, re-import of the original description is still skipped because `source_fingerprint` remains.
- File hash match with one new row inserts that row and returns `isDuplicate: true`.

UI checks on the import wizard and the account PDF dialog:

- A CSV row that matches an existing transaction is excluded from the count and is not posted.
- Including that row posts `overrideDuplicate: true` and the server inserts it.
- PDF behavior stays excluded-by-default.
- Re-importing the same PDF bytes adds nothing.
- `tests/import-upload-path.test.ts` still passes.

## Out of scope

- Fuzzy merchant matching (`UBER *` versus `UBER EATS`).
- Unique constraints that would make override impossible.
- Changing the account-name duplicate rules in `POST /api/import/accounts`.
- Replacing `imports.file_hash` or making that index unique.
- Categorization, except that skipped rows must not create rules and `updateTransactionRow` must preserve rule fields.
- Cloud sync of fingerprints.

## Rough size

M. The helper and the two routes are straightforward. The careful parts are the backfill, the SQLite transaction, keeping CSV and PDF review in step, and not dropping categorization fields when a row is revalidated.
