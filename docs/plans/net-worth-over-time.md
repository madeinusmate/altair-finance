# Net worth over time

## Goal

Show assets, liabilities, and household net worth by month for the dashboard date range, in the selected display currency, so the user can see whether net worth rose or fell. The latest point is the same household total as the net worth hero. Computation stays on device. This chart is not the investment profit/loss series.

## Current behavior

The hero is a point-in-time total, not a series.

- `app/(app)/dashboard/page.tsx` loads `GET /api/net-worth` with no date params and renders `components/dashboard/net-worth-card.tsx`. The currency picker is `TARGET_NET_WORTH_CURRENCIES` (`USD`, `EUR`, `SGD`) from `lib/currencies.ts`. The default chart range is the last 3 months: `startOfDay(subMonths(startOfMonth(now), 2))` through `endOfDay(now)`.
- Presets live in `components/dashboard/dashboard-date-selector.tsx`: last 3, 6, and 12 months, and all time. Last N months starts at the beginning of the current month minus (N − 1) months and ends today. The page sends `yyyy-MM-dd` via `format()`, not `toISOString()`.
- `app/api/net-worth/route.ts` values every account, converts with `getFxSnapshot` / `convertAmount` (`lib/fx.ts`), and returns `totalAssets`, `totalLiabilities`, `netWorth`, and `totalProfitLoss` per display currency. Investment profit/loss is `balance − net contributions` and is summed separately. It is already charted by `GET /api/dashboard/investment-performance` and `components/dashboard/investment-performance-chart.tsx`.
- Transaction-account balances use `calculateTransactionAccountBalance` in `lib/accounting.ts`. Per-account month-end series already exist as `reconstructMonthlyBalance` in `lib/chart-data-aggregation.ts`, used by `components/account-charts/account-charts-container.tsx` for one account. That helper refilters the ledger at every month, and the account page does not forward-fill `balance_history` or `investment_history` (those charts plot raw snapshot dates inside the range).
- `balance_history` and `investment_history` (`lib/db/schema.ts`, created in `lib/db/index.ts`) are append-only snapshots. Indexes are on `account_id` only. There is no unique `(account_id, date)`.
- The "Over time" section of the dashboard is a two-column grid: monthly income/expenses, net cash, spending, and investment P/L. There is no household net-worth series.

## Definitions

These three plans (`net-worth-over-time.md`, `savings-rate-and-runway.md`, `spending-versus-last-period.md`) share the definitions in this section. Implement them once, in `lib/insights/`, and import them. Do not re-derive a second income figure, a second month list, or a second FX rule.

**Display currency.** `selectedCurrency` on the dashboard, one of `USD`, `EUR`, `SGD`. Account rows may use any `SUPPORTED_CURRENCIES` value: `HKD`, `USD`, `SGD`, `EUR`, `GBP`.

**FX (v1).** Convert with the latest snapshot from `getFxSnapshot`. Every historical month uses that same snapshot. This is what `/api/net-worth`, the sankey, monthly income/expenses, spending, and investment performance already do. `getFxSnapshot` reads `exchange_rates` and calls `https://open.er-api.com/v6/latest/USD` only when the cached snapshot is missing or older than 24 hours. These features add no other network call.

Using the `exchange_rates` row effective on each month-end is a follow-up. The app only reads the latest snapshot today, so a month-end rate usually does not exist. Converting history at old rates while the hero and the cash-flow charts stay on the latest snapshot would make one balance look like two different amounts.

**Month boundaries.** Local calendar, `date-fns`.

- Default range: current month plus the two previous months, ending today. See Current behavior for the exact expression.
- Canonical parse of `yyyy-MM-dd`: the local split in `app/api/dashboard/monthly-income-expenses/route.ts` (start at `00:00:00.000`, end at `23:59:59.999`). `new Date("YYYY-MM-DD")` is UTC. Spending, sankey, `/api/dashboard/cash-flow`, and investment performance use that UTC parse today. This series uses the local parse so its months match the income chart.
- Months run from `startOfMonth(start)` through `startOfMonth(end)`, inclusive. Key `yyyy-MM`, label `MMM yyyy`.
- As-of for a month is `min(endOfMonth(month), range end)`. The open month ends today when the preset ends today.

**Income.** Sum of `transactions.amount` where `type = 'credit'` and the account's `type = 'transaction'`, converted into the display currency. Same filter as `app/api/dashboard/cash-flow-sankey/route.ts` and `app/api/dashboard/monthly-income-expenses/route.ts`. Transfers are not income. `POST /api/transactions` and `app/api/import/transactions/route.ts` reject accounts whose type is not `transaction`.

**Expenses.** Sum of `transactions.amount` where `type = 'debit'` and the account's `type = 'transaction'`, same conversion. This is the sankey expense node, the monthly expense bars, and the dashboard Spending tile. `/api/dashboard/spending` does not filter account type; the write paths make that a no-op for rows the app created. Insight code filters `type = 'transaction'` explicitly.

A credit-card purchase is a debit on a transaction account and is an expense. A payment from checking onto that card is a transfer and is not a second expense.

**Kept.** `income − expenses` over the dashboard range. That is the range form of net cash (`components/dashboard/net-cash-chart.tsx` plots `income − expenses` and does not subtract investment transfers).

**Sankey residual.** The Savings node in the sankey route is `income − max(0, investmentIn − investmentOut) − expenses`. It is not kept. `investmentIn` / `investmentOut` are transfers with one `transaction` side and one `investment` side. Transfers between two investment accounts are ignored.

**Liquid accounts.** `accounts.category` in `checking`, `savings`, `cash` (constants in `lib/account-categories.ts`, seeded by `seedDefaultCategories` in `lib/db/index.ts`), nature `asset`, type `transaction` or `balance`. Investment accounts are not liquid. `credit_card`, loans, `mortgage`, `brokerage`, `crypto`, retirement, and property categories are not liquid.

**Liabilities.** Stored as positive debt (`lib/accounting.ts`). Sign rule from `app/api/net-worth/route.ts`: an asset balance adds to assets (a negative asset reduces assets); a liability balance ≥ 0 adds to liabilities; a negative liability adds `abs(balance)` to assets.

**Current balance of one account**, matching `/api/net-worth`:

- `transaction`: `calculateTransactionAccountBalance`. Asset: `initial + credits − debits + transferIn − transferOut`. Liability: `initial + debits − credits + transferOut − transferIn`. Inbound transfers use `to_amount`, outbound use `from_amount`, falling back to `amount`.
- `balance`: latest `balance_history.balance`, or `initial_balance` when no row exists.
- `investment`: latest `investment_history.balance`, or `0`. Profit/loss stays on the existing investment chart. Creating an investment account forces nature `asset` and initial balance `0` (`app/api/accounts/route.ts`).

**Unsupported currency.** If any account fails `isSupportedCurrency`, the hero hides totals. This series does the same.

**Rounding.** `roundForNetWorth` in the net-worth route rounds each converted account balance before the sum: 0 decimal places when `abs ≥ 1_000_000`, otherwise 2. This series uses that rounding so the latest point can equal the hero. Income and expense totals elsewhere stay full precision.

### Series formula

For each month in the dashboard range, let `asOf` be the month as-of instant above. Sum every account that exists at `asOf` (rule below). Convert native balance with the latest FX snapshot, round with `roundForNetWorth`, then apply the liability sign rule.

```
assets(month)      = Σ classified asset amounts
liabilities(month) = Σ classified liability amounts
netWorth(month)    = assets(month) − liabilities(month)
```

`balance_history` and `investment_history` are forward-filled. Several rows may share an account and a calendar day. The row in force is the one with the greatest `date` that is still `≤ asOf`, breaking ties with the greatest `created_at`.

| Account type | Balance at `asOf` |
| --- | --- |
| `transaction` | `calculateTransactionAccountBalance` using only transactions and transfers with `date ≤ asOf`. Activity before the chart range still counts. This is the month-end logic in `reconstructMonthlyBalance`, evaluated once per account per month from a single chronological pass. |
| `balance` | Latest `balance_history` row with `date ≤ asOf`. If none, `initial_balance`. |
| `investment` | Latest `investment_history` row with `date ≤ asOf`. If none, `0`. Do not reconstruct a mark from contributions. |

**Existence.** An account opened in March must not appear in January.

- `transaction`: included when `created_at ≤ asOf`, or when any of its transactions or transfers has `date ≤ asOf` (imports are often dated before the row was inserted). `created_at` is insert time, not an "opened on" field, so a backdated transaction includes the account from that transaction's month.
- `balance`: included from the earliest `balance_history.date`. Account creation inserts that first row (`app/api/accounts/route.ts`). Months before it are omitted. If a balance account has no rows, include it from `created_at` at `initial_balance`, which is the hero's fallback.
- `investment`: included from the earliest `investment_history.date`. Before that the contribution to the sum is zero either way. Do not invent a market value from transfers.

When the range end is today, every account the hero includes has `created_at ≤ asOf` or a snapshot `≤ asOf`, so the last point includes the same set. Future-dated snapshots are the exception: the hero takes the latest row with no date cap, and this series ignores rows after `asOf`. Do not change the hero in this feature. The parity check uses "no snapshot dated after now".

Investment profit/loss is not a line on this chart.

## Proposed design

Place a full-width chart at the top of the existing "Over time" section in `app/(app)/dashboard/page.tsx`, above the two-column grid. It uses the same `dateRange` and `selectedCurrency` as the other charts. The date selector stays where it is (the Cash flow heading). Three series: assets, liabilities (drawn as a positive amount), and net worth. Recharts is already the chart library (`components/dashboard/net-cash-chart.tsx` is the closest pattern). Colors come from `components/charts/palette.ts`.

Add `GET /api/dashboard/net-worth-history?startDate&endDate&currency`. Leave `GET /api/net-worth` unchanged. That route is the hero, it takes no dates, and folding a series into it would change a payload the page already depends on.

No snapshot table for v1. Reconstruction is one read of `accounts`, `transactions`, `transfers`, `balance_history`, and `investment_history`, then one in-memory pass. The ledger is a single-user SQLCipher file. The default range is three months. `reconstructMonthlyBalance` is the wrong shape to call in a loop (it rescans per month per account); the household function walks rows once. A `net_worth_month` table would also go stale on every backdated edit, import, and delete, and no single write hook covers those paths. Revisit only if an all-time profile on a real device exceeds about 200ms, and keep any later cache local and invalidated by those writes.

Response shape:

```json
{
  "currency": "USD",
  "points": [
    { "month": "2026-08", "monthLabel": "Aug 2026", "asOf": "2026-08-31", "assets": 0, "liabilities": 0, "netWorth": 0 }
  ],
  "hasUnsupportedCurrencies": false,
  "unsupportedCurrencies": []
}
```

When `hasUnsupportedCurrencies` is true, return an empty `points` array and let the page keep the alert it already shows. Do not draw a partial household total.

## Work breakdown

1. Add `lib/insights/range.ts` with the shared local date parse, month list, and as-of rule. Later plans import this module.
2. Add `lib/insights/balances.ts` with `balanceAsOf`, snapshot selection (max `date`, then max `created_at`), the existence rule, and the asset/liability classification copied from `app/api/net-worth/route.ts`, including `roundForNetWorth`.
3. Add `lib/insights/net-worth-series.ts`. Load nothing itself; accept accounts, transactions, transfers, and both history tables, and return the month points. One chronological pass per account type, O(rows + months × accounts).
4. Add `app/api/dashboard/net-worth-history/route.ts`. Auth via `getEncryptionKey` like the other dashboard routes. Call `getFxSnapshot` once. Parse dates with `lib/insights/range.ts`.
5. Add `components/dashboard/net-worth-history-chart.tsx`. Loading, empty, and unsupported-currency states follow the other dashboard cards.
6. In `app/(app)/dashboard/page.tsx`, fetch the new route inside the existing `Promise.all` (do not add a sequential request after it) and render the chart in "Over time".
7. Add `tests/insights-net-worth.test.ts` and run it with `pnpm test`.

Do not edit `app/api/dashboard/investment-performance/route.ts` or replace `InvestmentPerformanceChart`.

## Data migration

None. `SCHEMA_VERSION` stays `1`. No new table, no unique index, no backfill. Duplicate history rows stay; reads pick the latest in force. A future local cache, if profiling requires one, is a later migration and is out of v1.

## Privacy

The series is computed in the local Next.js process against the SQLCipher database. The only network path is the one already inside `getFxSnapshot`. Do not add analytics, logging of balances, or logging of account names. `app/api/net-worth/route.ts` currently logs account ids and names; do not copy that into the new route.

## Risks and edge cases

- **Empty history.** No accounts: the page already hides charts behind the empty state. Accounts with a reconstructed zero balance: draw the flat line. A month before any snapshot for an investment account contributes 0.
- **Mixed currencies.** Convert each account from its own currency into the display currency, then round, then sum. Same order as the hero.
- **Liabilities.** A credit card stored as a positive liability increases `liabilities` and lowers net worth. An overpayment (negative liability balance) moves to assets, matching the hero. A mortgage updated only through `balance_history` holds its last snapshot until the next one.
- **Investments.** Market value is the forward-filled mark, not contributions and not profit/loss. A contribution with no later mark does not move this chart. The investment P/L chart remains the place for that question.
- **Missing FX.** If `getFxSnapshot` has no cache and the rate host is unreachable, it throws, as it does for the hero. Surface the same failure the page already handles for net worth. Do not fetch a second provider.
- **Accounts opened mid-series.** Follow the existence rule. `initial_balance` on a transaction account counts from `created_at` or from the first backdated transaction, not from the start of the chart.
- **Duplicate snapshots on one day.** No unique constraint. Latest `date`, then latest `created_at`.
- **Future-dated snapshot.** Hero and last point can disagree. Document it; do not change the hero here.
- **Partial current month.** As-of is today, not the future end of the month, so the last point is not a forecast.
- **All time.** Still one pass. Month count is "oldest month through now", not a query per month.
- **Hero parity drift.** Any new rounding, skipped account, or transfer-amount fallback that differs from `app/api/net-worth/route.ts` will show two net worths. The unit test locks the last point to that formula.

## Test plan

Unit tests in `tests/insights-net-worth.test.ts` (`pnpm test` runs `tsx --test tests/*.test.ts`). Pure functions, no database:

- One asset transaction account: month-end balance matches `calculateTransactionAccountBalance` and the last point matches the hero formula, including `roundForNetWorth`.
- Liability transaction account with a positive balance lands in `liabilities`. A negative balance lands in `assets`.
- Balance account with snapshots on Jan 10 and Jan 10 (later `created_at`) and Mar 1: January uses the later January row, February forward-fills it, March uses the March row. Months before the first snapshot omit the account.
- Investment account: forward-filled mark, no profit/loss field on the point. Months before the first mark omit it. A transfer with no mark does not create a balance.
- Account created in March is absent in January and present in March.
- Two currencies convert with a fixed rate map standing in for the latest snapshot. The same map is used for every month.
- Unsupported currency yields an empty series and the flag.
- Dashboard default range produces three month keys, the last `asOf` equal to the range end.

Manual check once implemented: hero amount equals the last net-worth point for USD, EUR, and SGD; changing the date preset redraws the series; the investment P/L chart is unchanged; offline with a fresh `exchange_rates` cache still renders.

## Out of scope

- A `net_worth_month` table or any other persisted aggregate.
- Replacing or restyling the investment performance chart.
- Historical FX rates.
- Changing `GET /api/net-worth` valuation rules, including its treatment of future-dated snapshots.
- Forecasting, goals, or a net-worth page outside the dashboard.
- Per-account breakdown under the household lines (the account page already charts one account).

## Rough size

L. Three account types, forward-fill, existence, hero parity, and a new chart. The math is local and the schema does not change, but the parity rules are easy to get subtly wrong.
