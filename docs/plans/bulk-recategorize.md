# Bulk recategorize

## Goal

On the global ledger and on an account register, select many posted rows and move them to one category. The category has to be legal for every selected row. The user confirms the change. One request updates all of them, or none.

Depends on `docs/plans/category-identity-survives-rename.md`. The batch writes `category_id`. Implement that plan first so this one does not grow a second, name-based update path.

## Current behavior

Posted rows are edited one at a time. The pencil on `app/(app)/transactions/page.tsx` and `app/(app)/accounts/[id]/page.tsx` opens `components/transaction-form.tsx`, which `PUT`s `/api/transactions` with `{ id, type, category, amount, description, date }`. `category` is the name string. `PUT` in `app/api/transactions/route.ts` checks `isValidTransactionCategoryForType` (`lib/db/category-helpers.ts`): the catalog name must exist, and `transaction_type` must equal the row's debit or credit, unless `transaction_type` is null. The form reloads `/api/transaction-categories?type=` when the type changes, and that query includes null-type categories.

Transfers use the pencil and `components/transfer-form.tsx`, which `PUT`s `/api/transfers`. The route only checks that the name exists (`isValidTransactionCategory`). The form only lists categories with `transactionType === null`.

There is no batch update route. `POST /api/import/transactions` inserts new rows; it does not update existing ones.

Import review edits many rows before they are posted, and it is not a selection model. `components/csv-import/csv-review-table.tsx` and `components/pdf-import/pdf-review-table.tsx` call a per-cell change handler. Category dropdowns there list every name, unfiltered by debit or credit. PDF review can exclude duplicate rows. Nothing in those tables applies one category to a checked set. `components/ui/checkbox.tsx` exists and no ledger page imports it.

After commit, the ledgers have pencil and trash only.

Single delete on the global ledger waits 5 seconds (`DELETE_UNDO_MS` in `app/(app)/transactions/page.tsx`). `scheduleDelete` removes the row from React state, shows a toast with Undo, and calls `DELETE /api/transactions?id=` or `DELETE /api/transfers?id=` when the timer finishes. The account page deletes immediately and toasts success, with no undo.

Both pages already hold every row from `GET /api/transactions-unified` (optional `accountId`). Page size only slices the filtered list.

The only multi-row category write today is `DELETE /api/transaction-categories`, which sets matching names to `"Other Expenses"`. The identity plan removes that silent rewrite.

## Proposed design

A checkbox column on both transaction tables, a bar when the selection is non-empty, and `POST /api/transactions/recategorize`.

Shared UI: `components/ledger/bulk-recategorize-bar.tsx`. Both pages pass the selected rows, the category list (id, name, `transactionType`, color, icon), and a refresh callback.

### Selection

- Checkbox in the header and on each row, using `components/ui/checkbox.tsx`.
- The header checkbox selects `filteredItems`, across pages, not only `paginatedItems`. Label it so "select all" means the filtered set ("Select 40 matching").
- Indeterminate when some of the filtered rows are selected.
- A bar above the table: "N selected", a category `<Select>`, and Recategorize.
- Clear the selection when search, account, category, type, page size, or the ledger date filter (`docs/plans/date-filters-on-ledgers.md`) changes. Stale ids from a previous filter are easy to miss.
- Rows with a pending 5-second delete on the global ledger are not selectable. Recategorizing a row that is about to disappear would succeed and then lose the row.

Account registers for `account.type === "transaction"` get the same column. Balance and investment accounts have no unified table; skip them.

### Which categories are offered

Pure function `legalCategoryIds(rows, categories)` in `lib/ledger/recategorize.ts`.

A catalog row is legal when every selected row accepts it:

| Selected row | Legal `transaction_type` |
|---|---|
| Debit transaction | `"debit"` or null |
| Credit transaction | `"credit"` or null |
| Transfer | null only |

Null matches `isValidTransactionCategoryForType` and the transfer form. A mixed debit-and-credit selection can only move to a null-type category (normally Transfer). If the legal list is empty, the bar says to narrow the selection and the button stays disabled. Do not offer a debit category for a set that contains a credit, and do not offer a typed category for a set that contains a transfer.

The `<Select>` lists those legal rows by current name. The value is `categoryId`.

### Confirm

Recategorize opens a dialog, not a toast. Copy: count of transactions, count of transfers, and the destination name. Confirm runs the request. Cancel leaves the selection in place.

This is a larger edit than the single-row delete, and the account page has no undo toast at all. A confirm is the same on both screens. Do not start a 5-second undo for the batch.

### API

`POST /api/transactions/recategorize`

```json
{ "categoryId": 12, "transactionIds": ["…"], "transferIds": ["…"] }
```

- Auth via `getEncryptionKey`, same as `PUT /api/transactions`.
- 400 when both id arrays are empty, when `categoryId` is missing, or when either array contains a non-string.
- 404 when the category id does not exist, or when any transaction or transfer id does not exist. Return the missing ids. Write nothing.
- Load each transaction's `type` and each transfer's id. Run `isValidCategoryIdForType` and `isValidTransferCategoryId` from the identity plan (`lib/db/category-helpers.ts`). 400 when any row fails, listing those ids. Write nothing.
- In one `db.transaction` (better-sqlite3, synchronous): `UPDATE transactions SET category_id = ? WHERE id = ?` and the same for `transfers`.
- Response: `{ updatedTransactions, updatedTransfers }`.

Ignore the leftover text `category` columns. Do not write the name into them.

The client then refetches `GET /api/transactions-unified` the way `handleTransactionUpdated` already does, and clears the selection.

Cap the body at the rows the user could have loaded. A practical guard is 5,000 ids, the same order of magnitude as the CSV paste cap in `lib/csv/parse.ts`. Over the cap: 400. The ledger is already fully in memory, so the cap is a runaway-client guard, not a pagination scheme.

### What this does not add

No bulk delete. Trash stays per row. No bulk edit of amount, date, account, or description.

Import review tables stay per-cell. They run before commit and already have a different editing model.

## Work breakdown

1. Category identity is in place: rows expose `categoryId`, helpers validate by id, `PUT /api/transactions` and `PUT /api/transfers` already take `categoryId`.
2. `lib/ledger/recategorize.ts` — `legalCategoryIds`.
3. `app/api/transactions/recategorize/route.ts` — `POST` as above.
4. `components/ledger/bulk-recategorize-bar.tsx` plus a small confirm dialog in that folder, built from the existing `Dialog` used by the transaction editor.
5. `app/(app)/transactions/page.tsx` — checkbox column, selection state, bar, skip pending deletes.
6. `app/(app)/accounts/[id]/page.tsx` — the same on the transaction register.
7. If the date-filter plan has landed, include `ledgerDateFilter` in the selection-reset effect. If it has not, reset on the filters that exist today.

## Data migration

None beyond the category-identity backfill. This plan adds no column. `SCHEMA_VERSION` stays 1. The batch updates `category_id` on existing rows.

## Privacy

No new network calls. The batch is a local update through the existing authenticated API, against the SQLCipher file.

## Risks and edge cases

- Mixed debit and credit selections collapse the dropdown to null-type categories. If the user has deleted Transfer and has no other null-type category, the bar cannot offer a target. That is the type rule, not a second silent bucket.
- A transfer that the identity backfill pointed at a debit category cannot stay on a debit category once it is in a batch. The batch may only set a null-type id. Leave those historical rows alone until the user selects them.
- A category deleted in Settings between opening the dropdown and confirming returns 404. Show the error and keep the selection.
- Partial failure is worse than a 400. The transaction wrapper is the requirement. Do not loop `PUT /api/transactions` from the client.
- Select-all on the filtered set can include rows on other pages. The confirm count is what makes that visible. If the count said "this page" it would be wrong.
- Pending undo-delete: excluded from selection. If the timer fires during the confirm dialog for a row that was selected before the delete started, the server 404s the missing id and writes nothing. Tell the user the row is already deleted.
- The account page's immediate delete can remove a selected row if the user deletes it with the trash icon while it is checked. On any successful single delete, drop that id from the selection.
- Import still allows a type mismatch only until the identity plan's 400 lands. This batch does not go through the import route.
- Two budgets are untouched. Recategorizing transactions changes which budget they count against, because spend joins on `category_id`. The confirm dialog should say that spent amounts will follow the new category. It should not edit `budgets`.

## Test plan

`tests/ledger-recategorize.test.ts` for `legalCategoryIds`:

- Debits only: debit categories and null-type categories.
- Credits only: credit categories and null-type categories.
- Transfers only: null-type categories.
- One debit and one credit: null-type only.
- One debit and one transfer: null-type only.
- Empty selection: empty list.

Manual:

- Select three debit rows on the global ledger, including one on page 2, move them to another debit category, confirm the dialog count, and see all three updated after refresh.
- Add a credit row to that selection and confirm the debit category disappears from the dropdown.
- Select a transfer and confirm a debit category is not offered.
- Cancel the dialog and confirm nothing changed.
- Force a 400 (destination deleted, or a stale credit id in the body) and confirm no row in the batch changed category.
- Repeat the debit move on an account register.
- On the global ledger, start a single-row delete, Undo it, and confirm bulk select still works. Start a delete and confirm that row's checkbox is disabled until Undo or the timer.

## Out of scope

- Bulk delete, bulk date edit, bulk amount edit.
- A name-based batch API. Callers send `categoryId`.
- Turning the import review tables into a multi-select. They stay pre-commit cell editors.
- Undo for the batch. Confirm is the guard. The 5-second toast stays on single delete on the global ledger only.
- Editing budgets inside this request. Spend follows `category_id` on its own.
- Hierarchy of categories.

## Rough size

**M.** Two tables need a selection model, and the rules for mixed debit, credit, and transfer rows are the real work. The write itself is one local update by id, once category identity exists.
