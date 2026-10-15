# Spending versus last period

## Goal

On the existing spending breakdown, show how each category changed against the previous period of equal length, and, when the selected range sits inside one calendar month and older data exists, against the same days last year. The user can see the amount, the percent change, the direction, and which categories appeared or disappeared. Computed locally, for the dashboard date range.

## Current behavior

`components/dashboard/spending-chart.tsx` is a horizontal bar chart of the current range only. The dashboard loads it from `GET /api/dashboard/spending?startDate&endDate&currency` inside the same `Promise.all` as the sankey (`app/(app)/dashboard/page.tsx`).

The route (`app/api/dashboard/spending/route.ts`):

- Requires `startDate` and `endDate`. Currency defaults to `USD`.
- Parses both with `new Date(param)`, which treats `YYYY-MM-DD` as UTC midnight. The monthly income route parses the same strings as local start-of-day and end-of-day. This plan switches spending to the local parse.
- Selects `transactions` where `type = 'debit'` and `date` is between the parsed bounds, inclusive. It does not filter `accounts.type`. `POST /api/transactions` and `app/api/import/transactions/route.ts` reject non-transaction accounts, so app-written rows are already transaction-account debits. The route does not read `transfers`.
- Converts each `amount` from the account currency with `getFxSnapshot` / `convertAmount` and sums by `transactions.category`.
- Returns `{ categories: [{ category, amount, percentage }], total, currency }`, sorted by amount descending. `percentage` is the share of `total`.

There is no previous-period field.

The dashboard Spending tile is a different total: it sums `expenses` from `GET /api/dashboard/monthly-income-expenses` (debits on transaction accounts, local months, per-month `Math.max(0, …)`). The date range default is the last 3 months, presets in `components/dashboard/dashboard-date-selector.tsx`.

`GET /api/dashboard/cash-flow` groups credits and debits by category and does not compare periods. `components/dashboard/cash-flow-chart.tsx` is unused. Do not extend that route or that component for this feature. Do not confuse it with net cash (`components/dashboard/net-cash-chart.tsx`), which is income minus expenses per month.

## Definitions

These three plans (`net-worth-over-time.md`, `savings-rate-and-runway.md`, `spending-versus-last-period.md`) share the definitions in this section. Implement them once, in `lib/insights/`, and import them.

**Display currency.** `selectedCurrency` on the dashboard, one of `USD`, `EUR`, `SGD`. Account rows may use any `SUPPORTED_CURRENCIES` value: `HKD`, `USD`, `SGD`, `EUR`, `GBP`.

**FX (v1).** Convert both periods with the latest snapshot from `getFxSnapshot`. The previous period and the year-ago period use that same snapshot, not a rate dated in the prior period. This matches spending, the sankey, monthly income, and the hero. `getFxSnapshot` reads `exchange_rates` and calls `https://open.er-api.com/v6/latest/USD` only when the cached snapshot is missing or older than 24 hours. This feature adds no other network call.

Using the rate effective in each period is a follow-up. A category delta computed at two different historical rates would no longer match a current-period bar built the way `/api/dashboard/spending` works today.

**Month boundaries.** Local calendar, `date-fns`.

- Default range: current month plus the two previous months, ending today.
- Canonical parse of `yyyy-MM-dd`: the local split in `app/api/dashboard/monthly-income-expenses/route.ts` (start `00:00:00.000`, end `23:59:59.999`). This route adopts it. That can move a transaction across the boundary versus the old UTC parse in timezones ahead of or behind UTC. The point of the change is that the spending window matches the income chart and the savings-rate window.
- Months run from `startOfMonth(start)` through `startOfMonth(end)`, inclusive. Key `yyyy-MM`.
- As-of for a month is `min(endOfMonth(month), range end)`. The spending comparison itself is a range sum, not a month-end balance.

**Income.** Credits on `accounts.type = 'transaction'`. Not used by this chart. Stated so the three plans do not invent a second income.

**Expenses.** Debits on `accounts.type = 'transaction'`. This chart's category totals are that set, grouped by `transactions.category`. Applying the account-type filter in the spending route matches the monthly expense query. For rows written by the app the totals do not change, because other account types cannot hold transactions.

Refunds logged as credits stay in income. They do not reduce a spending category. That is current spending-chart behavior; keep it.

**Kept.** `income − expenses` for the range. Not shown on this chart. Net cash is that series per month and does not subtract investment transfers.

**Sankey residual.** `income − max(0, investmentIn − investmentOut) − expenses`. Not a spending delta.

**Liquid accounts.** `checking`, `savings`, `cash`, nature `asset`, type `transaction` or `balance`. Not used here.

**Liabilities.** A debit on a credit card (transaction account, liability nature) is spending. A transfer that pays the card is not spending.

**Unsupported currency.** Skip the row, set the flag, and still return categories for supported currencies. `convertAmount` throws on a missing rate; do not fail the whole breakdown on one legacy account.

**Rounding.** Sums stay full precision, matching the current spending route. Format in the UI.

### Previous period

Equal length in calendar days, ending the day before the selected start:

```
dayCount      = differenceInCalendarDays(end, start) + 1
previousEnd   = endOfDay(subDays(start, 1))
previousStart = startOfDay(subDays(previousEnd, dayCount - 1))
```

"Last 3 months" on 15 Oct 2026 is 1 Aug through 15 Oct (76 days). The previous period is the 76 days ending 31 Jul, not "May–July" as calendar months. Equal day count is the rule, including when the open month is partial. A full January (1–31) therefore compares to a 31-day window ending 31 Dec, which is 1–31 Dec.

### Same month last year

Included only when the selected start and end fall in the same calendar month (`yyyy-MM` equal). That covers a custom 1–31 Jan and a partial 1–15 Oct. It does not cover the default last-3-months preset.

```
yearAgoStart = the same day-of-month in that month one year earlier
yearAgoEnd   = the same day-of-month, clamped to the last day of that month
```

15 Oct 2026 through 15 Oct 2026 compares to 15 Oct 2025 through 15 Oct 2025. 31 Jan 2025 through 31 Jan 2025 compares to 31 Jan 2024; 31 Jan 2024 through 31 Jan 2024 compares to 31 Jan 2023. Clamp with `endOfMonth` so a 31st does not spill into March when the prior February is shorter (the range is already inside one month, so the clamp only matters for the day-of-month copy onto a shorter month).

Omit year-ago when the oldest ledger timestamp is after `yearAgoEnd`. Oldest means the minimum of `transactions.date`, `transfers.date`, `balance_history.date`, `investment_history.date`, and `accounts.created_at`. If the ledger is older than the window but that month had no debits, still return year-ago totals of 0. "No spending" and "no data yet" are different: the first is a real zero, the second is a hidden comparison.

### Category delta

Category identity is the string `transactions.category`, the same key the route uses now.

For the current range and the previous range (and year-ago, when present), build the debit map. Then the union of category names:

```
delta     = current − previous
flat      = abs(delta) < 0.005
direction = flat ? "flat" : delta > 0 ? "up" : "down"
percent   = previous > 0 && !flat ? (delta / previous) * 100 : null
status    = previous <= 0 && current > 0 ? "new"
          : current <= 0 && previous > 0 ? "gone"
          : "ongoing"
```

`percentage` on the current amount stays "share of this period's total", which is what the tooltip shows today. Percent change is a separate field. Do not overwrite share-of-total with the delta.

Sort ongoing and new categories by current amount descending, then gone categories by previous amount descending. Gone categories have current amount 0 and must remain in the payload even though a bar chart of current amounts will not draw them.

`total` is the current-period sum. `previousTotal` and `yearAgoTotal` are the same sum on the other windows. The total's delta uses the same direction and percent rules.

## Proposed design

Extend `GET /api/dashboard/spending`. Do not add a second route: the chart already has one request, and the comparison is the same query three times. Keep `categories`, `total`, and `currency`. Add fields. Old clients that read only `amount` and `percentage` keep working.

```json
{
  "categories": [
    {
      "category": "Food & Drink",
      "amount": 120,
      "percentage": 40,
      "previousAmount": 100,
      "delta": 20,
      "percentChange": 20,
      "direction": "up",
      "status": "ongoing",
      "yearAgoAmount": 80,
      "yearAgoDelta": 40,
      "yearAgoPercentChange": 50,
      "yearAgoDirection": "up"
    }
  ],
  "total": 300,
  "previousTotal": 250,
  "totalDelta": 50,
  "totalPercentChange": 20,
  "totalDirection": "up",
  "comparison": { "startDate": "2026-05-17", "endDate": "2026-07-31", "dayCount": 76 },
  "yearAgo": null,
  "currency": "USD",
  "hasUnsupportedCurrencies": false
}
```

When the range is a single month and the ledger is old enough, `yearAgo` is `{ startDate, endDate, total, totalDelta, totalPercentChange, totalDirection }` and the per-category year-ago fields are numbers. Otherwise `yearAgo` is null and the year-ago category fields are omitted.

UI stays `components/dashboard/spending-chart.tsx`, in the same "Over time" cell. Add a caption under the title: total versus the previous period, with direction. The tooltip adds the previous amount and the percent change (or "New"). Under the bars, list gone categories and new categories in one line each so a disappeared category is visible. When `yearAgo` is present, add a second caption ("vs Oct 2025") rather than a second chart. Direction is a sign, not a budget judgment: more spending is not an error color. Use the existing foreground and muted tones from `components/charts/palette.ts`.

No snapshot table. The extra work is two more date filters on `transactions`, which the route already reads for one window.

## Work breakdown

1. Use `lib/insights/range.ts` for local parsing, `previousPeriod`, `isSingleCalendarMonth`, and `yearAgoPeriod`. Add that module here if the net-worth plan has not landed it yet; the functions must match the definitions above.
2. Add `lib/insights/spending.ts` with the debit aggregation (transaction accounts only, category map, latest-rate conversion) and the union/delta/status function. Pure.
3. Extend `app/api/dashboard/spending/route.ts`: local date parse, account-type filter, one `getFxSnapshot`, three windows, oldest-ledger check for year-ago. Preserve the current JSON keys.
4. Extend `SpendingChart` props and the tooltip. Thread the new fields from `app/(app)/dashboard/page.tsx`. The page already passes `dateRange` and `currency`.
5. Add `tests/insights-spending.test.ts`. Run `pnpm test`.

Do not modify `app/api/dashboard/cash-flow/route.ts` or `components/dashboard/cash-flow-chart.tsx`.

## Data migration

None. `SCHEMA_VERSION` stays `1`. Category names stay strings. No index is required for v1; `idx_transactions_category_date_type` already exists (`lib/db/index.ts`).

## Privacy

Local SQLCipher only. Same `getFxSnapshot` behavior as the current spending route. Do not log category totals. The comparison windows are derived from the dates the page already sends.

## Risks and edge cases

- **Empty history.** No debits in the current range and none in the previous range: keep the chart's empty state ("No spending data available"). Debits only in the previous range: `total` is 0, every category is `gone`, and the caption shows the decline. Do not treat that as an empty chart.
- **New and gone categories.** A category with no previous amount is `new` and has `percentChange` null, not infinity. A category that dropped to zero stays in the payload with `status` `gone`.
- **Equal-length partial months.** 1–15 Oct versus 16–30 Sep is correct under the day-count rule. It is not "versus September". The caption shows the previous start and end dates so the comparison is obvious. Year-ago, when the range is that October slice, is 1–15 Oct last year.
- **Default last 3 months.** Previous period only. `yearAgo` is null because the range spans three months.
- **Mixed currencies.** Both windows use one rate map. A SGD debit and a EUR debit in the same category add after conversion. A rate change between this month and last year does not appear in the delta in v1; the follow-up is historical FX, shared with the other two plans.
- **Liabilities.** Credit-card debits count. Card payments, which are transfers, do not. A refund stored as a credit does not reduce the category.
- **Missing FX.** Same as today's spending route when the snapshot cannot be loaded. One unsupported account currency is skipped and flagged, not a 500 for the whole chart.
- **Accounts opened mid-series.** Previous-period and year-ago totals only include debits dated inside those windows. An account with no older transactions produces `new` categories or a null year-ago, via the oldest-ledger rule. Do not backfill zeros for months before the first transaction and then call them a 100 percent increase from a fabricated zero; a real zero (ledger already existed, no debits) still uses the percent rules above.
- **UTC parse change.** A device not on UTC can include or exclude boundary transactions differently than the current spending route. That aligns spending with the income chart. Call it out in the implementation notes.
- **Share of total versus change.** The existing tooltip percent is share of the current total. Keep the label distinct from percent change.
- **Float dust.** Deltas under half a cent are `flat` so FX rounding does not show a 0.0001 percent move.

## Test plan

`tests/insights-spending.test.ts` via `pnpm test`:

- Two categories in the current window, one shared with the previous window: amount, share `percentage`, `delta`, `percentChange`, `direction`, `status`.
- Category only in the current window: `new`, null percent. Category only in the previous window: `gone`, amount 0, direction `down`.
- `previous` 0 and `current` 0: omitted, not a row.
- Day-count: 1 Aug–15 Oct produces a previous window of the same length ending 31 Jul. 1–31 Jan produces a previous window of 1–31 Dec.
- Single month 1–15 Oct sets year-ago to 1–15 Oct the year before. A three-month range leaves year-ago null. Oldest ledger date after the year-ago end omits it. Oldest ledger date before that end with no debits returns zeros.
- 31 Jan compared with a non-leap February does not produce a March date; the helper clamps.
- Debit on a non-transaction account is ignored. A transfer is ignored. A credit refund is ignored.
- Both windows convert with the same rate map.
- Delta of `0.001` is `flat`.

Manual check once implemented: default last-3-months view shows a previous-period caption and no year-ago caption; a custom single-month range shows both when the ledger is old enough; the bar total matches the sum of category amounts; gone categories appear in the list; the unused cash-flow chart stays unused; the Spending tile still shows its own range sum (it will match this total when no month was clamped and every debit is on a transaction account).

## Out of scope

- Budget-versus-actual on this chart (the Budget tile and `/budget` already exist).
- Netting refunds against categories.
- Changing net cash, the sankey, or `/api/dashboard/cash-flow`.
- A new spending page, more chart types, or merchant-level deltas.
- Historical FX.
- Calendar-quarter comparison as a substitute for equal day count.

## Rough size

M. The query and the chart already exist. The size is the comparison windows, the new/gone states, the local date-parse alignment, and keeping share-of-total distinct from percent change.
