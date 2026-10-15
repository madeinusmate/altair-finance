# Budgets match the month

## Goal

The month selector on the budget page chooses which month's cap you are looking at, and editing that month writes that month only. A month you have never edited shows the latest earlier cap, labeled as carried forward. The total includes spending in debit categories that have no cap. This is a monthly spending limit. Unspent money does not roll into next month, and income is not assigned into envelopes.

Depends on `docs/plans/category-identity-survives-rename.md`. Caps and spend both key off `category_id`.

## Current behavior

`budgets` in `lib/db/schema.ts` is `id`, `category_name`, `amount` (`real`), `currency`, `created_at`, `updated_at`. There is no period column. `idx_budgets_category_name` is not unique. Two rows for one name are possible; `POST /api/budgets` prevents that only by looking up the name and updating the first hit.

`GET /api/budgets?currency=&month=YYYY-MM` (`app/api/budgets/route.ts`, `GET`) loads every budget row. `month` changes only the spend window: `startOfMonth` through `endOfDay` of the last day of that month. With no `month` param the window is the start of the current month through `endOfDay(now)`. Each cap is converted into the display currency with `convertAmount` and `getFxSnapshot` (`lib/fx.ts`), which uses the latest stored rate or fetches one. Spend is `calculateCategorySpending`: debit `transactions` in that window, `accounts.type != "investment"`, joined on `transactions.category = budgets.category_name`. The function returns 0 when the name is `"Transfer"`. The `transfers` table is not queried. `remaining` is `Math.max(0, cap - spent)`. `isOverBudget` is `spent > cap`. `overallSpent` sums spend on budget rows only.

`POST /api/budgets` body is `{ categoryName, amount, currency }`. No month. It requires a debit catalog row, then updates amount and currency on the existing name or inserts a row. There is no `PUT`. `DELETE /api/budgets/[id]` deletes that row.

`app/(app)/budget/page.tsx` holds `selectedMonth` as `yyyy-MM` and refetches when it changes. `isCurrentMonth` and `isPastMonth` are computed and never read. `startOfMonth` and `endOfDay` are imported and unused. The edit dialog (`components/budget/budget-edit-dialog.tsx`) posts `categoryName`, `amount`, and `currency`. Saving January overwrites the only row, which is also June's cap.

`components/budget/month-selector.tsx` lists the current month and the previous 11, and disables next when the value is the current month. Previous/next does `new Date(value + "-01")`, which parses as UTC and can land on the wrong local month.

`components/budget/budget-category-list.tsx` renders a row per budget and then every category name that has no budget as "Unlimited". The page loads `/api/transaction-categories` with no type filter, so credit categories and Transfer show up as Unlimited. Those rows are dimmed and excluded from `overallBudget` / `overallSpent`. `components/budget/budget-summary-card.tsx` shows "Left to spend" from `overallRemaining`, which cannot go below zero. `components/budget/budget-charts.tsx` ignores its `budgets` and `month` props and passes the overall percent to `budget-gauge-chart.tsx`.

`GET /api/dashboard/budget` (`app/api/dashboard/budget/route.ts`) duplicates `calculateCategorySpending`, always uses the current month through `endOfDay(now)`, and feeds `components/dashboard/budget-tile.tsx`. Same clamp on remaining. `GET /api/budgets/spending` is unused by the UI.

No tests cover budgets.

## Proposed design

One explicit cap per `(category_id, year_month)`. `year_month` is a `YYYY-MM` string in the user's local calendar. Reading a month with no row copies the latest earlier cap forward for display. Writing always upserts the month on screen.

The category-identity plan adds `budgets.category_id` and switches `POST` to that id while there is still one row per category. This plan adds the month on top of that column. Do not key the new unique index off `category_name`.

### Resolution

`resolveMonthBudget(rowsForCategory, yearMonth)` in `lib/budget/resolve-month.ts`:

- If a row exists for `yearMonth`, return its amount with `inherited: false`.
- Otherwise take the row with the greatest `year_month` that is still less than `yearMonth`. Return that amount with `inherited: true` and `inheritedFrom` set to that month. The response `id` is null, so the client cannot delete the source month by mistake.
- Otherwise the category is unbudgeted for this month.

Copy-forward is a read. `GET` does not insert a row. Editing March later changes June only while June is still inherited. Once June has its own row, March edits leave it alone. The row caption states this: "Carried forward from Mar 2026". The save button says "Set June budget".

Unspent does not carry. Next month's cap is the amount, not amount minus what was spent.

### Spend

Replace the per-category query with one grouped query for the month, shared by `GET /api/budgets` and `GET /api/dashboard/budget` (`lib/budget/spend-for-month.ts`):

- Debit transactions only.
- `category_id` of a catalog row whose `transaction_type` is `"debit"`.
- Date in the selected month, `startOfMonth` through `endOfDay` of the last day. Parse `YYYY-MM` as local `new Date(year, monthIndex, 1)`, same as the budgets route already does when `month` is present.
- Account type is not `"investment"`.
- The `transfers` table is not included.
- Convert each amount with the existing `getFxSnapshot` / `convertAmount` path. Latest rate, same as today.

`GET /api/dashboard/budget` uses this helper for the current month's full window so the tile matches the budget page. Today the tile stops at `endOfDay(now)` and the page, because it always sends `month`, runs through the last day of the month. Those match unless a transaction is dated later this month. One window removes that split.

### Totals

`overallBudget` is the sum of resolved caps for the month, including inherited caps, in the display currency.

`overallSpent` is budgeted spend plus spend in debit categories that have no resolved cap.

`unbudgetedSpent` is that second part, also returned as `unbudgeted: [{ categoryId, categoryName, spent }]`.

`overallRemaining` is `overallBudget - overallSpent` and may be negative. The summary card shows that signed number. Add a line for unbudgeted spend when it is non-zero.

Per category, keep `remaining = max(0, cap - spent)` and `isOverBudget`, and add `overAmount = max(0, spent - cap)` so the row can say how far over it is. The bar already treats percent above 100 as over.

The list shows every debit category (`transaction_type === "debit"`). A category with no resolved cap is "No budget", with its spent amount, and a Set budget action. Stop using the word "Unlimited". Stop listing credit categories and Transfer. The existing `?type=debit` filter on `GET /api/transaction-categories` also returns null-type rows; filter those out on the budget page.

### Write

`POST /api/budgets` body: `{ categoryId, yearMonth, amount, currency }`.

- `categoryId` must be a debit category (identity plan).
- `yearMonth` must be `YYYY-MM`.
- Upsert the row for that pair only. Update amount, currency, and `updated_at`, or insert a new uuid.
- Catch a unique-constraint conflict and update, so two clicks cannot create two rows.

`DELETE /api/budgets/[id]` deletes that month's row only. The month then inherits again, or becomes "No budget" when nothing earlier exists. The list hides delete on inherited rows (`id` null).

`components/budget/budget-edit-dialog.tsx` receives `yearMonth` and `categoryId` and posts both. `app/(app)/budget/page.tsx` passes `selectedMonth`. `isCurrentMonth` gates pace. `isPastMonth` does not disable editing. Past months are real caps.

### Pace

When `yearMonth` is the current local month, each resolved cap includes `pace: "on-track" | "ahead"`.

`expected = amount * (dayOfMonth / daysInMonth)`. `on-track` when `spent <= expected`, otherwise `ahead`. Use the spend figure from the month query. Past months omit `pace`; `isOverBudget` is the result. Inherited caps still get pace in the current month, because the cap is in force.

Show one word under the category bar and on the summary. No chart work. `budget-charts.tsx` can keep ignoring `month`.

### Month control

Keep `MonthSelector` as the last 12 months, no future months. Fix previous/next to parse `YYYY-MM` with `new Date(year, monthIndex, 1)` so the UTC date-string parse cannot skip a month.

### Dashboard tile

`components/dashboard/budget-tile.tsx` keeps calling `GET /api/dashboard/budget`. The route uses `resolveMonthBudget` for the current month and the shared spend helper, including unbudgeted spend in `overallSpent` and the signed remaining. Existing `status` (`over` / `approaching` / `under`) stays, computed from the shared percent. Empty state stays "Set a budget".

## Work breakdown

1. Finish category identity, or land `ensureCategoryIds` before `ensureBudgetMonths` in the same `runMigrations`.
2. `lib/db/schema.ts` — `yearMonth: text("year_month")` on `budgets`. Unique index `idx_budgets_category_month` on `(category_id, year_month)`.
3. `lib/db/index.ts` — `ensureBudgetMonths(sqlite)`, called from `runMigrations` immediately after `ensureCategoryIds`, and from `initializeDb` in the same order. Fresh `CREATE TABLE budgets` includes `category_id` and `year_month`.
4. `lib/budget/resolve-month.ts` — the pure resolver.
5. `lib/budget/spend-for-month.ts` — one grouped spend query plus FX. Delete the copied `calculateCategorySpending` from `app/api/budgets/route.ts` and `app/api/dashboard/budget/route.ts`.
6. `app/api/budgets/route.ts` — `GET` resolves each debit category for `month`. `POST` upserts `(categoryId, yearMonth)`.
7. `app/api/dashboard/budget/route.ts` — current month via the same helpers.
8. `app/api/budgets/spending/route.ts` — point it at `category_id` or leave it, but do not let it keep grouping by the stale name. Nothing in the UI calls it.
9. `components/budget/budget-edit-dialog.tsx`, `budget-category-list.tsx`, `budget-summary-card.tsx`, `month-selector.tsx`.
10. `app/(app)/budget/page.tsx` — pass the month into the dialog, request categories with `transactionType`, use `isCurrentMonth` for pace.
11. `components/dashboard/budget-tile.tsx` — only if the JSON adds `unbudgetedSpent` and the tile should show it. At least keep the tile's numbers equal to the budget page for the current month.

## Data migration

Leave `SCHEMA_VERSION` at 1. Same reason as the category plan: version is not how this file migrates.

`ensureBudgetMonths` runs after every `budgets.category_id` is filled:

1. Add `year_month TEXT` if missing.
2. Collapse duplicate `category_id` values before the month is set. Keep the row with the greatest `updated_at`, then the greatest `rowid`. Do not add the amounts. Log the dropped id and amount.
3. For each remaining row with a null `year_month`, set it to the earlier of:
   - the local `YYYY-MM` of `created_at` (unix seconds → `new Date(seconds * 1000)`),
   - the local `YYYY-MM` of the first month in the selector window, `format(subMonths(startOfMonth(now), 11), "yyyy-MM")`.
   If `created_at` is in the future, use the current month.
   A budget created today is anchored at the start of the 12-month window, so every month the selector already shows keeps the cap the user sees now. A budget created earlier keeps that earlier month as the anchor, and later months copy forward.
4. `CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_month ON budgets(category_id, year_month)`.
5. If the index creation fails, the collapse missed a pair. Throw rather than boot with two caps for one month.

Months before the anchor have no row and no earlier row, so they read as "No budget". The selector cannot show those months when the anchor is the window start. An API caller who passes an older `month` will see the difference. That matches "this cap did not exist yet" for old created dates, and it preserves the visible year for caps created this month.

The leftover `category_name` column is not part of the unique key. Do not read it.

## Privacy

No new network calls. Spend conversion keeps using `getFxSnapshot` in `lib/fx.ts`, which already may request `https://open.er-api.com/v6/latest/USD` when the local snapshot is older than 24 hours. This plan does not add a call, does not request historical rates, and does not send transaction amounts anywhere. Caps stay in the SQLCipher file.

## Risks and edge cases

- Carried-forward months change when an earlier explicit month changes. The caption is the only thing that makes that obvious. Saving the later month freezes it.
- Deleting October's row brings September's cap back onto October. Say that in the delete confirm on `budget-category-list.tsx`.
- Two different amounts for one category before this migration: the older `updated_at` is dropped. Look at the log if a user reports a changed cap.
- Latest FX means a past month's spend and cap, when the cap's currency differs from the display currency, move when the rate moves. Historical rates are out of scope. Same-currency budgets do not move.
- `overallRemaining` can be negative. The summary card and the dashboard tile must show the minus rather than clamping, or unbudgeted spend disappears again.
- Pace on the first day of the month is `amount / daysInMonth`. A single large debit shows "ahead" immediately. That is the formula.
- Future months stay unreachable in the selector. `POST` may still receive a future `yearMonth`; reject anything after the current month so the API matches the control.
- Investment-account debits stay out of spend. A debit in a budgeted category on an investment account will not move the bar.
- Null-type categories are not budgetable. Spend on them is not in the unbudgeted debit total.
- The dashboard tile and the budget page can disagree by a rate refresh if they load seconds apart. They already can. Same helper is enough.

## Test plan

`tests/budget-resolve-month.test.ts` with `node:test`:

- Exact row wins over an earlier row.
- Missing month copies the latest earlier row and sets `inherited`.
- A later row does not copy backward.
- No earlier row returns unbudgeted.
- Pace: spent under the prorated cap is `on-track`; over it is `ahead`; a non-current month has no pace.

Manual:

- Set Food to 400 in the current month, switch to last month, confirm the cap shows as carried forward, set last month to 200, return to this month and confirm it is still 400.
- Edit the earlier month while a later month is still inherited and confirm the later display follows. Save the later month and confirm it stops following.
- Spend in a debit category with no cap shows on the list and inside the summary spent figure. The summary can go below zero.
- Credit categories and Transfer are absent from the list.
- Dashboard tile overall matches the budget page for the current month in the same currency.
- Rename the category (identity plan) and confirm the budget row follows.

## Out of scope

- Envelope budgeting, income assignment, and rollover of unspent amounts.
- A shared annual cap or a weekly cap.
- Historical FX for the month being viewed.
- Integer money. `amount` stays `REAL`.
- Budgeting credit categories or transfers.
- Replacing the gauge chart.
- Letting the month selector go into future months or further back than 12. Older months still resolve if an anchor exists and a caller passes `month`.

## Rough size

**L.** The page is already there, but the table gains a period, the read path grows a carry-forward rule, spend has to be computed once and shared with the dashboard, and the total has to include categories that today are omitted on purpose.
