# Date filters on ledgers

## Goal

The global ledger and the account register can be limited to this month, last month, the last 3 months, the last 12 months, all time, or a custom range. Transfers stay in the list. The filter matches the calendar day already shown on the row.

## Current behavior

`app/(app)/transactions/page.tsx` (`TransactionsPage`) loads the full ledger with `GET /api/transactions-unified` and no query string. State is `searchQuery`, `categoryFilter`, `typeFilter`, `accountFilter`, `currentPage`, and `itemsPerPage` (default 50, options 50–250). `filteredItems` applies those four filters in memory and sorts by `new Date(item.data.date)`. `paginatedItems` is `filteredItems.slice`. A `useEffect` resets `currentPage` when the filters or the page size change. There is no date state. Day headers use `format(new Date(item.data.date), "yyyy-MM-dd")` from `date-fns`.

`GET` in `app/api/transactions-unified/route.ts` accepts only `accountId`. Both branches use `.all()` with `orderBy(desc(date))`. There is no `startDate`, `endDate`, `limit`, or `offset`. Transfers are a second array. With `accountId`, transactions match that account and transfers match either `fromAccountId` or `toAccountId`.

`app/(app)/accounts/[id]/page.tsx` loads `GET /api/transactions-unified?accountId=`. The register (search, category, type, same client pagination) renders only when `account.type === "transaction"`. Its `dateRange` state drives the investment chart, not the table. `GET /api/transactions?accountId=` still exists and this page does not use it.

Charts already have range controls, and they filter arrays that were already fetched:

- `components/account-charts/date-range-selector.tsx` (`DateRangeSelector`) — Last 3, Last 6, Last 12, All time. All time is `new Date(2015, 3, 1)`. Custom dates snap to `startOfMonth` / `endOfMonth`. Used by `components/account-charts/account-charts-container.tsx`, default last 12 months.
- `components/dashboard/dashboard-date-selector.tsx` (`DashboardDateSelector`) — the same four presets. Preset end is `endOfDay(now)`. All time uses `oldestDate` when passed, otherwise 1 April 2015. Custom dates use `startOfDay` / `endOfDay` via `new Date(start)` on a `YYYY-MM-DD` string, which is UTC midnight. `getDisplayText` can say "Current Month" for a 1-month range, and there is no Current Month button. The dashboard page and the account investment chart use this component. Dashboard requests pass `yyyy-MM-dd` and avoid `toISOString()` on purpose (`app/(app)/dashboard/page.tsx`).

Transaction `date` is an integer unix timestamp (`lib/db/schema.ts`, Drizzle `mode: "timestamp"`). The form posts `YYYY-MM-DD` from `<input type="date">`, and `POST /api/transactions` stores `new Date(date)`. There is no `lib/date` module.

`UnifiedItem` is `{ type: "transaction", data: Transaction } | { type: "transfer", data: Transfer }`. The type filter value `"transfer"` keeps transfer rows and drops debit/credit rows.

## Proposed design

Filter on the client, in the same `filteredItems` memo that already applies search, account, category, and type. The API already returns every row, and pagination is already a slice. A server `startDate` would be a second filtering model sitting under client filters.

Add `components/ledger/ledger-date-filter.tsx`. Model the popover on `DashboardDateSelector` (preset buttons, custom start and end, `date-fns`). Give it the ledger presets. Leave `DateRangeSelector` and `DashboardDateSelector` on the charts so account charts keep month snapping and the 3/6/12 set.

```ts
type LedgerDateFilter =
  | { kind: "all" }
  | { kind: "range"; startDate: Date; endDate: Date };
```

Default is `{ kind: "all" }`, which is what the ledgers show today.

| Preset | Start | End |
|---|---|---|
| This month | `startOfMonth(now)` | `endOfMonth(now)` |
| Last month | `startOfMonth(subMonths(now, 1))` | `endOfMonth` of that month |
| Last 3 months | `startOfMonth(subMonths(now, 2))` | `endOfMonth(now)` |
| Last 12 months | `startOfMonth(subMonths(now, 11))` | `endOfMonth(now)` |
| All | no date predicate | |
| Custom | local start of the chosen day | local end of the chosen day |

Last 3 and last 12 include the current month, same idea as the chart presets, and they run through the end of the month so a transaction dated later this month stays visible.

All does not use 1 April 2015. A row older than that date is still a real row. `kind: "all"` skips the comparison.

Custom parsing splits `YYYY-MM-DD` and builds `new Date(year, monthIndex, day)`. That is local midnight. `new Date("YYYY-MM-DD")` is UTC and is how `DateRangeSelector` snaps custom chart ranges; do not copy it onto the ledger.

Apply the filter to every `UnifiedItem`, transactions and transfers, using the same day key as the section header:

```ts
const day = format(new Date(item.data.date), "yyyy-MM-dd");
const start = format(range.startDate, "yyyy-MM-dd");
const end = format(range.endDate, "yyyy-MM-dd");
// keep when start <= day <= end
```

String order on `yyyy-MM-dd` matches the day the user sees, including rows whose stored instant is UTC midnight.

Put the control on the filter row of `app/(app)/transactions/page.tsx` and on the register filter row of `app/(app)/accounts/[id]/page.tsx`. On the account page name the state `ledgerDateFilter`. The existing `dateRange` stays wired to the investment chart and to `DashboardDateSelector`. Changing the register range does not refetch and does not move the charts. Changing a chart range does not move the register.

Add `ledgerDateFilter` to the effect that sets `currentPage` back to 1.

Balance and investment accounts have no unified register. Do not add the control to the transfers card on those layouts.

When category identity (`docs/plans/category-identity-survives-rename.md`) is already in place, this filter still only looks at `date`. The category `<Select>` on these pages will use `categoryId`. Do not compare the filter to the leftover `transactions.category` text column.

## Work breakdown

1. Add `components/ledger/ledger-date-filter.tsx` and export `LedgerDateFilter`.
2. Add `lib/ledger/date-filter.ts` with `isInLedgerDateFilter(date, filter)` using the `yyyy-MM-dd` comparison, so the page and the tests share one function.
3. `app/(app)/transactions/page.tsx` — state, memo, page reset, control next to the existing selects.
4. `app/(app)/accounts/[id]/page.tsx` — the same, only for the transaction-account register, in a separate state variable from the chart range.
5. No change to `app/api/transactions-unified/route.ts`.

## Data migration

None. `SCHEMA_VERSION` stays 1. No new columns. Dates are already unix timestamps.

## Privacy

No new network calls. The filter runs on rows the ledger already loaded from the local database.

## Risks and edge cases

- A transaction stored from `new Date("YYYY-MM-DD")` is UTC midnight. In timezones behind UTC, `format(new Date(iso), "yyyy-MM-dd")` can be the previous local day. The filter uses that same format, so the row stays on the day the header already shows. Fixing storage to local midnight is a separate change; doing it only in the filter would hide rows that the header still shows.
- Custom end before start: keep the popover open and do not call `onChange`.
- All plus a huge ledger still downloads every row. That is the current load. Move the date predicate into `GET /api/transactions-unified` only if pagination and the other filters move to the server with it.
- Account chart "All time" still starts in 2015. The register "All" does not. The two controls are independent, so that difference is expected.
- The account register's account filter for transfers on the global ledger only matches `fromAccountId` (`transactions/page.tsx`). This plan does not change that. A transfer still has to pass the date filter and that account rule.
- Resetting to page 1 on every range change drops the user at the top. Same as the other filters.

## Test plan

`tests/ledger-date-filter.test.ts`:

- `kind: "all"` keeps every date.
- This month's bounds include the first and last local day and exclude the adjacent days.
- Last month does not include today when today is not in that month.
- A UTC-midnight ISO string is classified by the local `yyyy-MM-dd` `date-fns` would print for it.

Manual, desktop width:

- Global ledger: each preset, then a custom range that cuts through a day group. Transfers inside the range stay. Page index returns to 1.
- Open an account of type transaction: the register filter does not move the inflow chart's range, and the chart control does not hide register rows.
- An investment or balance account page still has no register date filter.
- Narrow the window and confirm the control still sits on the filter row without covering search.

## Out of scope

- Server query params on `/api/transactions-unified`.
- Changing chart presets, the April 2015 all-time fallback, or month-snapped custom chart ranges.
- Date filters on dashboard tiles, the budget month selector, or the import review tables.
- Rewriting stored timestamps from UTC midnight to local midnight.
- Hiding transfers in the filtered range.

## Rough size

**S.** One control, one pure predicate, and two existing client memos. The data is already in the browser.
