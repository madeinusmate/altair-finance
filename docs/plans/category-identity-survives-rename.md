# Category identity survives rename

## Goal

A transaction category keeps one identity for as long as it exists. Renaming it updates the label on every transaction, transfer, budget, and chart that already uses it. Deleting it never silently rewrites those rows onto "Other Expenses".

Budgets (`docs/plans/budgets-match-the-month.md`) and bulk recategorize (`docs/plans/bulk-recategorize.md`) both key off this id. Ship this plan first.

## Current behavior

`transaction_categories.id` is an integer primary key. Nothing else stores it.

`lib/db/schema.ts`:

- `transaction_categories`: `id` integer PK, `name` text unique, `transaction_type` (`"debit"`, `"credit"`, or null for Transfer), `color`, `icon`, timestamps. No parent column.
- `transactions.category` is `text`, required. The row stores the name.
- `transfers.category` is `text`, required, default `"Transfer"`. The row stores the name.
- `budgets.category_name` is `text`, required. The row stores the name. There is no foreign key and no unique constraint. The only index is the non-unique `idx_budgets_category_name` created in `lib/db/index.ts`.

The same columns are created as plain `TEXT` in `initializeDb` (`CREATE TABLE transactions`, `CREATE TABLE transfers`, `CREATE TABLE budgets`).

`PUT /api/transaction-categories` (`app/api/transaction-categories/route.ts`, `PUT`) updates the catalog row and returns. It does not update `transactions`, `transfers`, or `budgets`. After a rename, spend queries that compare `transactions.category` to `budgets.category_name` (`calculateCategorySpending` in `app/api/budgets/route.ts`) find nothing, and charts keep a slice under the old name.

The in-use check on that same `PUT` only looks at `transactions.category = existing.name`, and only when `transactionType` changes. Transfers are ignored. The duplicate-name lookup uses `eq` on the trimmed name. The comment says case-insensitive; SQLite `=` is case-sensitive for this text.

Account categories do cascade. `PUT /api/account-categories` regenerates `account_categories.identifier` and then runs `UPDATE accounts SET category = newIdentifier WHERE category = old identifier`. Transaction categories have no equivalent.

`DELETE /api/transaction-categories?id=` loads every matching transaction and transfer by name. If any exist, it finds or creates a catalog row named `"Other Expenses"` (the created row omits `transaction_type`, so it is null) and sets `transactions.category` and `transfers.category` to that string. It then deletes the catalog row. Budgets are left pointing at the old name, so that budget's spend drops to zero. Debit spend that moved onto "Other Expenses" lands in the Other Expenses budget if one exists. Credit transactions and transfers are rewritten to the same expense name, so income charts and transfer rows change meaning. Deleting "Other Expenses" while it is in use reassigns rows to "Other Expenses" and then deletes the catalog row, leaving the string with no catalog entry.

`lib/db/category-helpers.ts` looks up categories by name:

- `isValidTransactionCategory` — the name exists.
- `isValidTransactionCategoryForType` — the name exists and `transaction_type` equals the transaction's `debit`/`credit`, or `transaction_type` is null (allowed on both).

`POST` and `PUT` `/api/transactions` reject a type mismatch. `POST` and `PUT` `/api/transfers` only check that the name exists, so a transfer may point at a debit or credit category. `components/transfer-form.tsx` only offers categories whose `transactionType` is null. `POST /api/budgets` rejects anything whose `transactionType` is not `"debit"`. `POST /api/import/transactions` rejects an unknown name and, on a debit/credit mismatch, logs a warning and inserts anyway.

`PRAGMA foreign_keys` is never turned on. `applyCipherPragmas` in `lib/db/index.ts`, `lib/db/import-utils.ts`, and `app/api/app/import/route.ts` sets the SQLCipher key and `journal_mode = WAL` only. Drizzle declares `REFERENCES` from transactions, transfers, balance history, and investment history to `accounts.id`, and from `import_id` to `imports.id`. Those clauses are not enforced. Category columns have no `REFERENCES` at all. `lib/db/import-utils.ts` runs `PRAGMA foreign_key_check` as a diagnostic during database import and does not enable enforcement.

`SCHEMA_VERSION` in `lib/db/index.ts` is the constant `1`. It is inserted into `meta` once. It is never updated. `runMigrations` is imperative `PRAGMA table_info` plus `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS`, called from `getDb` on every new connection. `initializeDb` does not call `runMigrations`. It has its own copy of the same ALTERs for existing files, and a `CREATE TABLE IF NOT EXISTS` script for every file. `runMigrations` returns immediately when the `transfers` table is missing, which skips every migration placed below that return.

Seeded names live in `seedDefaultCategories` in `lib/db/index.ts` (debit names include "Other Expenses"; credit names include Salary and Other Income; Transfer is inserted with a null type). `lib/categories.ts` is a stale list with no importers.

There is no `category_id` column anywhere. `transaction_categories.id` is only the catalog key for settings edit/delete.

## Proposed design

Store `transaction_categories.id` on the ledger and on budgets. The name is a label on the catalog row. Renaming updates that label. Existing rows keep the same id, so history stays attached.

Add:

| Table | Column | Meaning |
|---|---|---|
| `transactions` | `category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT` | expense or income category |
| `transfers` | `category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT` | transfer category |
| `budgets` | `category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT` | budgeted category |

Leave `transactions.category`, `transfers.category`, and `budgets.category_name` in place. This codebase adds columns; it does not rebuild tables to drop them. After the backfill, no read path and no write path uses those strings to decide identity. A rename must not copy the new name back into them. Any code that still compared the strings would bring the bug back.

Enable `PRAGMA foreign_keys = ON` inside every `applyCipherPragmas` (`lib/db/index.ts`, `lib/db/import-utils.ts`, `app/api/app/import/route.ts`), before migrations run. `ON DELETE RESTRICT` is what stops a category delete from orphaning or rewriting history. With the pragma off, the new clause would be documentation.

This is the durable fix. Cascading the name inside one transaction, the way account-category rename updates `accounts.category`, would repair a rename today and would still leave identity as a string. The delete path, a case mismatch, or any writer that saved a name would split history from the catalog again.

### Reads

Routes that return a category to the client join `transaction_categories` and send both fields:

- `categoryId` — the integer
- `category` — the current catalog `name`
- `color` and `icon` when the screen already shows them

`GET /api/transactions-unified` is the ledger payload (`app/(app)/transactions/page.tsx` and `app/(app)/accounts/[id]/page.tsx`). `GET /api/transactions` and `GET /api/transfers` get the same shape. Dashboard groupings (`app/api/dashboard/spending/route.ts`, `app/api/dashboard/cash-flow/route.ts`, `app/api/budgets/spending/route.ts`, `app/api/dashboard/budget/route.ts`) group by `category_id` and label the group with the current name, so a rename does not split one category into two slices.

The ledger search boxes keep matching the display name. The category `<Select>` on both ledgers uses `categoryId` as the value. `CategoryBadge` still receives the display name plus color and icon.

### Writes

`POST` and `PUT /api/transactions` take `categoryId`. `isValidCategoryIdForType` in `lib/db/category-helpers.ts` loads the catalog row by id and applies today's rule: null `transaction_type` is allowed on debit and credit; otherwise the type must match. The name-based helpers stay as thin wrappers for the import review UI, which still edits names before commit.

`POST` and `PUT /api/transfers` take `categoryId`. The row must exist. Keep the form rule from `components/transfer-form.tsx`: the offered list is `transactionType === null`. The route should enforce that same rule so an API client cannot attach a transfer to a debit or credit category. Existing transfer rows that already point at a typed category stay valid until someone edits them; the backfill preserves those ids.

`POST /api/budgets` takes `categoryId`. The category must exist and `transaction_type` must be `"debit"`. Until `docs/plans/budgets-match-the-month.md` lands, upsert stays one row per `category_id` (replace the lookup on `category_name`). That plan adds the month and changes the lookup to `(category_id, year_month)`.

`POST /api/import/transactions` resolves each transaction `category` string to an id at insert time. An unknown name is a 400 for that row. The CSV wizard may still substitute `"Other Expenses"` before posting (`hooks/use-import-wizard.ts`); that is a client choice, and the server stores the id of the name it was given. A debit/credit mismatch is a 400. Stop inserting mismatches with a warning. Transfer rows in that payload omit category today and rely on the SQL default `'Transfer'`. Resolve the Transfer catalog row and set `category_id` explicitly.

`components/transaction-form.tsx` already loads `/api/transaction-categories?type=debit|credit` (that filter includes null-type rows, which is correct for the form). Send the selected row's `id`, not its name.

### Rename and delete

`PUT /api/transaction-categories` keeps updating `name`, `transaction_type`, `color`, and `icon` on the catalog row only.

Changing `transaction_type` while any `transactions.category_id` points here still returns 400. Also return 400 when any `budgets.category_id` points here and the new type is not `"debit"`. Transfers do not block a type change; call that out in the dialog if transfers exist, because the transfer form will stop offering the category once it has a type.

`DELETE /api/transaction-categories?id=` counts references in `transactions`, `transfers`, and `budgets` by `category_id`.

- Zero references: delete the catalog row.
- Any references, and no replacement id: **409** with `{ transactions, transfers, budgets }` counts. Do not create "Other Expenses". Do not update ledger rows.
- Optional `reassignToCategoryId` (query or JSON body): the user picked a destination. In one `sqlite.transaction`:
  - Every referenced transaction must pass `isValidCategoryIdForType` for the destination.
  - Every referenced transfer must pass the transfer rule (destination `transaction_type` is null). If a historical transfer points at a typed category, that transfer can move only to a null-type category.
  - Budget rows move only when the destination is debit and has no budget row of its own. If the destination already has a budget, return 409 and leave both rows. Do not add the amounts together. The month plan's unique `(category_id, year_month)` makes a blind move unsafe; until that plan lands, "no budget row" means no row with that `category_id`.
  - Then delete the catalog row.
- The whole reassignment commits or rolls back together. A foreign-key failure becomes a 409, not a half-applied delete.

`components/category-management/category-delete-dialog.tsx` shows the three counts. When the count is non-zero it requires a destination category whose type can legally accept every referenced row. If no single destination can (mixed debit and credit, or transfers plus a typed target), the dialog says to recategorize on the ledger first. That ledger action is `docs/plans/bulk-recategorize.md`.

`ON DELETE RESTRICT` is the backstop if a caller skips the check. The handler still counts first so the client gets the counts instead of a SQLite error string.

### Fresh databases

`seedDefaultCategories` is unchanged. New writes set `category_id` from the start. The SQL default `'Transfer'` on `transfers.category` can stay on the unused text column; inserts must set `category_id`.

Parent categories are out of scope. `transaction_categories` has no parent column, and this plan does not add one.

## Work breakdown

1. `lib/db/schema.ts` — add `categoryId` on `transactions`, `transfers`, and `budgets`, with `.references(() => transactionCategories.id, { onDelete: "restrict" })`.
2. `lib/db/index.ts` — `PRAGMA foreign_keys = ON` in `applyCipherPragmas`. Add `ensureCategoryIds(sqlite)` and call it at the top of `runMigrations` (above the early return that skips the rest of the function when `transfers` is missing) and at the end of `initializeDb` for both fresh and existing files. Put `category_id` on the fresh `CREATE TABLE` statements for the three tables, plus indexes `idx_transactions_category_id`, `idx_transfers_category_id`, `idx_budgets_category_id`. Leave `SCHEMA_VERSION` at 1.
3. `lib/db/import-utils.ts` and `app/api/app/import/route.ts` — the same pragma in their copies of `applyCipherPragmas`.
4. `lib/db/category-helpers.ts` — add `isValidCategoryIdForType` and `isValidTransferCategoryId`. Keep the name helpers for import review.
5. `lib/db/category-identity.ts` — pure `inferCatalogType(types: Array<"debit" | "credit">): "debit" | "credit" | null` for the orphan backfill. `"debit"` only when every transaction using that name is debit, `"credit"` only when every one is credit, otherwise null so mixed history stays valid.
6. `app/api/transactions/route.ts`, `app/api/transfers/route.ts`, `app/api/import/transactions/route.ts`, `app/api/budgets/route.ts` — read and write `category_id`. Join the name on the way out.
7. `app/api/transactions-unified/route.ts` and the dashboard routes listed under Reads — join and group by id.
8. `app/api/transaction-categories/route.ts` — `PUT` stops being the only writer that matters; `DELETE` becomes the 409 / explicit-reassign flow. In-use checks use `category_id`.
9. `components/transaction-form.tsx`, `components/transfer-form.tsx`, `components/budget/budget-edit-dialog.tsx` — submit `categoryId`.
10. `components/category-management/category-delete-dialog.tsx` — counts and a required destination when something still points at the category.
11. `app/(app)/transactions/page.tsx`, `app/(app)/accounts/[id]/page.tsx` — category filter value is `categoryId`. Search still uses the joined name. `Transaction` and `Transfer` types come from `lib/db/schema.ts`; the pages already import them.
12. `hooks/use-import-wizard.ts` and `components/pdf-import/pdf-statement-import.tsx` — keep editing names in the review table. The import route resolves them. Surface a 400 from a type mismatch in the existing import error toast.
13. Grep for `.category` and `categoryName` on these tables and switch remaining readers (`components/dashboard/recent-activity.tsx`, `components/dashboard/spending-chart.tsx`, `components/dashboard/cash-flow-chart.tsx`, `app/api/budgets/spending/route.ts`). Account `accounts.category` is an account-category identifier. Leave it alone.

## Data migration

`SCHEMA_VERSION` stays `1`. Schema changes in this app are idempotent SQL inside `runMigrations` / `initializeDb`, not Drizzle Kit history. Bumping `meta.schema_version` would fight `lib/db/import-utils.ts`, which treats a higher version as a newer app and a lower version as "migrations will run", while every real change so far has shipped at version 1.

`ensureCategoryIds` is idempotent and wrapped in `sqlite.transaction`:

1. If `transactions` does not exist yet, return. `initializeDb` creates tables, then calls this again.
2. `PRAGMA table_info`. `ALTER TABLE ... ADD COLUMN category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT` on `transactions`, `transfers`, and `budgets` when the column is missing. New columns are nullable. SQLite cannot add `NOT NULL` to an existing table without a rebuild, and this codebase does not rebuild tables. The backfill below refuses to finish while any id is null, and every writer requires an id.
3. Run `PRAGMA foreign_key_check`. Log any pre-existing account or import violations. Do not abort on those. They were already unenforced. Aborting would make the app refuse to open a file that opens today.
4. Build a map of `transaction_categories.name` → `id`.
5. Collect distinct `transactions.category`, `transfers.category`, and `budgets.category_name` values that are non-null and absent from that map. For each missing name, insert a catalog row with that exact string. Set `transaction_type` with `inferCatalogType` from the transactions that use the name. A name that appears only on transfers or budgets gets null type. This keeps the history visible under the label the user already sees, instead of folding it into "Other Expenses".
6. `UPDATE transactions SET category_id = (SELECT id FROM transaction_categories WHERE name = transactions.category) WHERE category_id IS NULL`, and the same for `transfers.category` and `budgets.category_name`.
7. If any of the three columns is still null, throw. `getDb` will fail the open rather than boot with rows that have no category.
8. Run `PRAGMA foreign_key_check` again. Throw if any `category_id` points at a missing catalog row.
9. `CREATE INDEX IF NOT EXISTS` on each new column.

Duplicate budget rows that share a name both receive the same `category_id`. Collapsing them is part of the budget-month migration, which needs a single winner before it can add a unique `(category_id, year_month)`.

Do not update the leftover text columns during backfill. They remain a snapshot of the pre-migration names.

## Privacy

No new network calls. Category rows, ledger rows, and the migration all read and write the local SQLCipher file. Rename and delete stay on `PUT` and `DELETE /api/transaction-categories`, which already run inside the app.

## Risks and edge cases

- Turning `foreign_keys` on also enforces the existing `accounts` and `imports` references. A later update of a row that already violates one of those will fail. Log `foreign_key_check` before shipping so that case is visible. Do not try to repair account orphans in this change.
- `ON DELETE CASCADE` on `account_id` starts working. Deleting an account will delete its transactions, transfers, and history rows at the database, which matches the declared schema. Confirm the account-delete route already deletes those children itself so the user-visible result stays the same.
- Orphan names become real categories. They show up in Settings. That is intentional. Reviewers should expect a one-time appearance of any typo that was stored on a transaction.
- Two names that differ only by case stay two categories. Matching is exact, same as the unique index on `name`.
- A budget whose `category_name` points at a credit category gets a `category_id` and then fails the debit check on the next edit. Leave the row in place during migration. The budget page should skip non-debit categories when it renders, which the month plan does by listing `transaction_type = "debit"` only.
- Reassign-on-delete of mixed debit and credit rows has no legal single target except a null-type category. The dialog must refuse a typed target rather than move income onto an expense category.
- Moving a budget onto a category that already has a budget returns 409. The user deletes or edits one of them first.
- Import files that relied on the server accepting a debit category on a credit row start getting 400. The review table has to show that error. The previous behavior stored bad data.
- `runMigrations` and `initializeDb` can both run. `ensureCategoryIds` has to be safe to run twice.
- The text columns will go stale on the next rename. That is safe only if the grep in the work breakdown actually finds every reader. Add a short comment above the columns in `lib/db/schema.ts` saying they are leftover labels and must not be read.

## Test plan

`package.json` runs `tsx --test tests/*.test.ts`.

- Add `tests/category-identity.test.ts` for `inferCatalogType`: all debit → debit, all credit → credit, mixed → null, empty → null.
- Manual, on a copy of a real `netly.db`: rename "Food & Drink" and confirm an old transaction, a budget for that category, and the spending chart all show the new name and the same amounts.
- Delete a category that has transactions, with no destination: 409, rows unchanged, budget spend unchanged.
- Delete with a legal destination: rows and the budget point at the destination id; the old catalog row is gone.
- Delete with a destination of the wrong type: 400 or 409, nothing written.
- Create a debit transaction with a credit `categoryId`: 400.
- Import a credit row tagged with a debit category: 400, no insert.
- Open the database with `PRAGMA foreign_keys` and `foreign_key_check` after migration: no `category_id` violations.
- Rename an account category and confirm account identifiers still cascade. This change must not alter that path.

## Out of scope

- Parent or hierarchical categories.
- Integer money. Amounts stay `REAL`.
- Per-month budget rows (the next plan). This plan only adds `budgets.category_id` and switches the upsert key from the name to that id.
- Bulk multi-select on the ledger (the bulk plan). Delete-time reassign covers the settings screen only.
- Dropping the old text columns.
- Repairing pre-existing account or import foreign-key violations.
- Changing account-category identity. Accounts keep storing the identifier string, and that rename keeps cascading.

## Rough size

**L.** The column itself is small. Every writer and every grouping query currently treats the name as the identity, the delete behavior has to change, and foreign keys have to be turned on in three connection openers without locking existing files out.
