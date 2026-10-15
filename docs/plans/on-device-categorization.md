# On-device categorization

## Goal

When a CSV or a PDF is reviewed, Netly fills a missing category from rules stored in the local database, matched on the transaction description. The review row shows which rule matched, and the person can pick a different category before import. Correcting a category remembers that description for next time. A small settings list can add or delete rules. Nothing is sent to a classifier. Rules run before insert. Rows the duplicate plan skips do not create rules and do not get inserted.

## Current behavior

There is no rules table. `transactions.category` is the category name, denormalized, not a foreign key (`lib/db/schema.ts`). `transaction_categories` holds `name` (unique), `transaction_type` (`debit`, `credit`, or null for `Transfer`), `color`, and `icon`.

Seeded names are written by `seedDefaultCategories` in `lib/db/index.ts` only when `transaction_categories` is empty. Debit names include `Shopping`, `Food & Drink`, `Subscriptions`, `Fees`, and `Other Expenses`. Credit names include `Salary`, `Investment`, `Other Income`, and `Capital Gain Income`. `Transfer` is inserted with `transaction_type` null. Users can add more through `POST /api/transaction-categories` and `app/(app)/settings/categories/page.tsx`.

`lib/csv/import-validators.ts` `validateTransactionRows` keeps a category only when it is in the valid-name list and the row is not a transfer. Otherwise it substitutes `Other Expenses` if that name exists, else `Other`, else the literal `Other Expenses`, and pushes `Category defaulted to ${normalizedCategory}`. Transfers do not use that default.

The CSV wizard (`hooks/use-import-wizard.ts` `processFile`) calls `validateTransactionRows` and stops there. `importRows` posts `row.category`, and if that name is somehow not in the loaded list it falls back to `Other Expenses` again. The review select is in `app/(app)/settings/import/page.tsx` (the category column, disabled when `type === "transfer"`). `updateTransactionRow` re-runs `validateTransactionRows` for the edited row and then `applyTransactionDuplicateFlag`. The object it keeps is the validated row plus `id` and `rowNumber`. Extra fields will be dropped unless they are copied.

PDF import (`components/pdf-import/pdf-statement-import.tsx`) asks the parser for a category. Today that parser is OpenAI (`lib/pdf/openai-client.ts`), which is told to pick one of `getTransactionCategoryNames` and which drops rows whose category is not in the list. The guess is not stored as a rule. The local parser plan returns `category: ""`, which this validator turns into `Other Expenses`. The PDF review table (`components/pdf-import/pdf-review-table.tsx`) already has a category select.

`PUT /api/transactions` updates `transactions.category` after `isValidTransactionCategoryForType`. It does not remember the description. `PUT /api/transaction-categories` can rename a category and does not rewrite `transactions.category` or any other table. A renamed category leaves old transaction rows on the old string. Rules must live with that same limitation: store the name, and ignore a rule whose name is no longer valid.

There is no payee column. The description is the only merchant text.

`POST /api/import/transactions` checks `isValidTransactionCategory` and still inserts when the category's `transaction_type` does not match the row type (it `console.warn`s). Manual `POST /api/transactions` rejects a type mismatch. Rules should only suggest a category that passes `isValidTransactionCategoryForType` for that row.

## Proposed design

Add `categorization_rules` and apply it in the review step on this machine. The import route keeps trusting the category on the row. It does not run a second classifier.

### Shared import pipeline

Same order as the parse and duplicate plans:

1. Parse. CSV via `lib/csv/parse.ts`. PDF via the on-device parser unless that request opted into OpenAI.
2. Categorize. This plan, immediately after `validateTransactionRows`, before duplicate flags are shown. A CSV category that is already valid is kept. A missing or invalid category is replaced when a rule matches. The user can override in the review table. The value posted is the value on the row.
3. Duplicates. The duplicate plan excludes matching rows unless the user includes them. Fingerprints do not include category.
4. Insert. The server skips duplicates inside one SQLite transaction. A skipped row does not create a rule. The server does not replace `category`.
5. Learn. For rows that were actually inserted, if the user changed the category during review, upsert one rule for that normalized description.

### Table

In `lib/db/schema.ts` and in the `CREATE TABLE` / `runMigrations` paths in `lib/db/index.ts`:

```sql
CREATE TABLE IF NOT EXISTS categorization_rules (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'exact',
  category_name TEXT NOT NULL,
  transaction_type TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorization_rules_pattern_type
  ON categorization_rules(pattern, ifnull(transaction_type, ''));
```

`pattern` is the normalized description. `match_type` is `exact` for this version. Do not implement `contains` yet; the column lets a later change add it without another table. `transaction_type` is `debit`, `credit`, or null. Null means the rule applies to both. A typed rule wins over an untyped rule for the same pattern. `category_name` is the display name, same string `transactions.category` uses.

v1 matching is exact only. `UBER * TRIP` does not match `UBER * EATS`. Payee extraction is a follow-on and is not required.

### Matcher

`lib/categorization/rules.ts`:

- `normalizeDescription`: same function as `lib/import/fingerprint.ts` (trim, lowercase, collapse whitespace). Import it from there. Do not keep a second normalizer.
- `matchRule(rules, description, type)`: normalize the description, ignore rules whose `category_name` fails `isValidTransactionCategoryForType` for `type`, prefer a rule with `transaction_type === type` over one with null, return the rule or null. `match_type` other than `exact` is ignored.
- `applyRulesToRows(rows, rules, categoryNames)`: for each non-transfer row, if the category is missing, invalid, or the row's warnings include the defaulted-category warning, and a rule matches, set `category` to the rule's name, remove the defaulted warning, and set `ruleMatch` to a short label such as `Matched “starbucks” → Food & Drink`. If the CSV category is already valid, leave it, even when a rule disagrees. Set `ruleHint` in that case (`Rule says Food & Drink`) and do not change `category`. Do not set `categoryTouched`.
- Empty description: no match, no learn.

Call `applyRulesToRows` in `hooks/use-import-wizard.ts` after `validateTransactionRows` inside `processFile`, and in `components/pdf-import/pdf-statement-import.tsx` after `validateTransactionRows` inside `handleFileSelected`. Load rules with the accounts and categories those screens already fetch.

`updateTransactionRow` revalidates the row and today drops unknown fields. Copy `ruleMatch`, `ruleHint`, `categoryTouched`, `excluded`, and `overrideDuplicate` onto the validated row. If `key === "category"`, set `categoryTouched` true and clear `ruleMatch` when the new category differs from the rule. If `key === "description"` and `categoryTouched` is not true and the defaulted warning is present, run `matchRule` again so an edit before the user picks a category can still hit a rule. If they already picked a category, do not overwrite it.

PDF `handleRowChange` does not rebuild the row through `validateTransactionRows`. Set `categoryTouched` there when `updates.category` is set.

Show `ruleMatch` or `ruleHint` in the CSV review (a line under the category select in `app/(app)/settings/import/page.tsx`) and in `components/pdf-import/pdf-review-table.tsx` (next to the existing badges). The user must be able to see why the category was chosen and change it with the select that already exists.

OpenAI, when the parse plan's checkbox is on, may still return a category. Apply rules after validation. A rule match replaces the model guess and the label should say the rule won (`Matched “…” → Food & Drink`). The model guess is not saved.

### Learn

New route `app/api/categorization-rules/route.ts`, same auth as the other routes (`getEncryptionKey`, 401 without it).

- `GET` returns the rules, joined in the handler to drop or flag names that are not in `transaction_categories`.
- `POST` creates or replaces the rule for `(pattern, transaction_type)`. Body: `description` or `pattern`, `categoryName`, optional `transactionType`. Normalize the pattern on the server. Reject an empty pattern, `Transfer`, and a category that fails `isValidTransactionCategoryForType`.
- `DELETE` takes `id`.

Upsert on learn uses that POST. Last correction for a pattern and type wins.

Learn from review only when all of these are true: the row was included in the successful import response (not listed as a skipped duplicate), `categoryTouched` is true, the description normalizes to a non-empty pattern, the type is `debit` or `credit`, and the category is valid for that type. Do not learn from an untouched `Other Expenses` default. Do not learn from a valid category that arrived in the CSV and was not edited. Do not learn from a rule match the user left alone. Send the learn requests after the import returns, only for inserted rows. If the import response cannot identify which client rows were skipped, send `overrideDuplicate` rows and non-duplicates only, which is the set `importRows` already posts, and skip learning if `skippedDuplicates` equals the posted count for a total failure. Practical rule: the client knows which rows it posted; the server inserts all of them or, on a duplicate skip, returns enough to know which indexes were skipped. Learn only for posted indexes that were not skipped. If the route rolls back, learn nothing.

Also learn from `components/transaction-form.tsx` when an edit saves a new category through `PUT /api/transactions` and the description is non-empty. Compare to the category loaded with the transaction. Create the rule after the PUT succeeds. Do not learn on create-from-scratch unless you want the first manual entry to become a rule; do learn on create as well when description and category are both set, so the next import of that merchant matches. One code path: after a successful create or update, POST the rule. The user can delete it in settings if that was too aggressive. Do not learn when the category is `Transfer`.

### Settings

On `app/(app)/settings/categories/page.tsx`, add a third card, "Description rules", under the existing transaction and account category tables. List pattern, type, and category. A delete button calls `DELETE`. An add row: description text, debit or credit or both, category select from the debit or credit names already loaded. Link copy on `app/(app)/settings/page.tsx` can stay "Manage Categories"; the rules live on that page so there is not another settings destination.

When a category is deleted, delete rules with that `category_name` in the category DELETE handler (`app/api/transaction-categories/route.ts`) if one exists, or leave them and let `matchRule` ignore invalid names. Prefer deleting the rules in that handler so the settings list does not fill up with dead rows. Do not rewrite historical `transactions.category` values; renaming already does not.

## Work breakdown

1. Add the table to `lib/db/schema.ts` and both migration sites in `lib/db/index.ts` (see Data migration).
2. Add `lib/categorization/rules.ts` using `normalizeDescription` from `lib/import/fingerprint.ts`. If the fingerprint module is not landed yet, put `normalizeDescription` in `lib/import/normalize.ts` and have both plans import it. One function.
3. Add `app/api/categorization-rules/route.ts`.
4. Fetch rules in `useImportWizard` and `PdfStatementImport`. Call `applyRulesToRows` after validation.
5. Preserve `ruleMatch`, `ruleHint`, and `categoryTouched` in `updateTransactionRow`. Set `categoryTouched` from the CSV category select and from `handleRowChange`.
6. Show the match text in `app/(app)/settings/import/page.tsx` and `components/pdf-import/pdf-review-table.tsx`.
7. After a successful import, POST rules for touched, non-skipped rows. Wire the same POST from `transaction-form.tsx` after a successful save.
8. Add the rules card on `app/(app)/settings/categories/page.tsx`.
9. On category delete, remove rules for that name.
10. Add `tests/categorization-rules.test.ts`.

## Data migration

`SCHEMA_VERSION` stays `1`. Add the `CREATE TABLE IF NOT EXISTS` and the unique index in `runMigrations` and in the existing-database branch of `initializeDb`, and include the table in the fresh-database script inside `initializeDb`. No backfill. Existing transactions keep their categories. Rules start empty, so the first imports behave as they do today (`Other Expenses` when the CSV category is unknown) until the user corrects one or adds a rule.

Do not rewrite `transactions.category`. Do not seed rules from past transactions in this change. A one-shot "learn from history" would encode old mistakes, including rows already dumped into `Other Expenses`.

## Privacy

Rules are rows in the local SQLCipher database. Matching runs in the Next process on `127.0.0.1` and in the review UI. Descriptions are not sent to a categorization API. This plan adds no network calls. It does not change the opt-in OpenAI PDF path; that path still only runs when the parse plan's checkbox is on, and a local rule overrides the returned category before import.

## Risks and edge cases

- Exact match misses `UBER * TRIP 123` after the user taught `UBER * TRIP`. That is accepted for v1. `contains` and payee parsing are follow-ons, not part of the implementation.
- A typed rule and an untyped rule: the typed one wins. Two typed rules cannot share `(pattern, transaction_type)` because of the unique index.
- CSV file says `Shopping` and the rule says `Food & Drink`. Keep `Shopping`, show `ruleHint`, do not learn unless the user changes the select.
- Learning an untouched default would paint every unknown merchant as `Other Expenses`. `categoryTouched` prevents that.
- Duplicate rows that the server skips must not be learned, or a skipped old row would overwrite a good rule with whatever the review table showed.
- `updateTransactionRow` drops fields it does not copy. Forgetting `categoryTouched` makes the next description edit look untouched and can clobber the user's category when rules reapply.
- Category rename does not update transactions or rules. After a rename, the rule's `category_name` fails validation and stops matching. The settings list should show those rules as broken or delete them when the old name is gone. Do not try to fix rename-propagation here.
- `Transfer` rows and the `Transfer` category are not rule targets.
- Type mismatch: do not suggest a debit category for a credit row. The import route currently only warns; the review UI should still only offer a legal category so the inserted row is consistent.
- The PDF model and the rule can disagree. The rule wins when it matches, and the label says so, because the user's correction is the memory the model does not have.
- Race: two rapid corrections on the same pattern. Last POST wins. That is enough.

## Test plan

`tests/categorization-rules.test.ts`:

- `Coffee Shop` and `  coffee   shop ` hit the same exact rule.
- A `debit` rule beats an untyped rule for a debit row. A credit row still gets the untyped rule.
- A rule whose category is not in the allowed list for that type returns no match.
- `applyRulesToRows` replaces `Other Expenses` when the defaulted warning is present, and does not replace a valid CSV category.
- Empty description does not match.
- `contains` is not consulted even if a row were stored with that `match_type`.

Manual, on the import wizard and the account PDF dialog:

- Unknown CSV category with no rule becomes `Other Expenses` with the existing warning.
- Add a rule in settings for that description. Re-process the file. The review row shows the matched category and the match label. Import stores that category.
- Change the select to another category and import. A second file with the same description shows the new category.
- Leave the matched category untouched and import. The rule does not change.
- A row marked duplicate and left excluded does not change rules.
- Edit an existing transaction's category in `transaction-form.tsx`. The next import of the same description follows it.
- Delete the category and confirm the rule no longer applies.
- With the cloud PDF checkbox off, no categorization request leaves the machine.

`pnpm test` and `pnpm typecheck` stay green.

## Out of scope

- Substring, regex, or payee rules.
- Seeding rules by scanning historical transactions.
- Rewriting `transactions.category` when a category is renamed.
- A cloud or hosted model.
- Changing the duplicate fingerprint.
- Auto-creating categories that are not already in `transaction_categories`. The user creates those on the categories page.

## Rough size

M. One table, one matcher, a small settings card, and careful hooks in the two review flows so a user correction sticks and a skipped duplicate does not teach the rule.
