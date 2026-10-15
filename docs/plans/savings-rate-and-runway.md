# Savings rate and runway

## Goal

Answer two questions on the dashboard, computed locally. What percent of income in the selected period was kept? How many months of typical expenses the liquid accounts cover today? Show the kept amount split into what moved to investment accounts and what stayed in cash, so the percent is not the sankey "Savings" residual.

## Current behavior

Nothing on the dashboard answers either question.

- Cash flow for the selected range is `GET /api/dashboard/cash-flow-sankey`, rendered by `components/dashboard/cash-flow-sankey-chart.tsx`. Income is credits on `accounts.type = 'transaction'`. Expenses are debits on those accounts. Investment is net transfers from transaction accounts to investment accounts, clamped at 0 for the node. The Savings node is `income − investment − expenses`, and it may be negative. That residual is not deposits into `category = 'savings'` accounts.
- `components/dashboard/net-cash-chart.tsx` plots `income − expenses` from `GET /api/dashboard/monthly-income-expenses`. It does not subtract investment transfers. The monthly route uses the same transaction-account credit and debit filter, buckets by local `yyyy-MM`, and clamps each month's income and expenses with `Math.max(0, …)` before returning them.
- The Spending tile in `app/(app)/dashboard/page.tsx` sums those monthly expense figures over the selected range.
- `components/dashboard/financial-health-score.tsx` is a placeholder (hardcoded score 72) and is not imported by the dashboard. Do not use it.
- `components/dashboard/cash-flow-chart.tsx` and `GET /api/dashboard/cash-flow` (income and expenses grouped by category, no account-type filter) are unused. They are not the source for this stat.
- The stat row under the hero is Budget (`components/dashboard/budget-tile.tsx`), a Spending sparkline, and Investment P/L. Currency and the date range are the same state as the rest of the page. Presets and the default last-3-months range are in `components/dashboard/dashboard-date-selector.tsx` and `app/(app)/dashboard/page.tsx`.
- Liquid category identifiers `checking`, `savings`, and `cash` are listed in `lib/account-categories.ts` and inserted by `seedDefaultCategories` in `lib/db/index.ts`.

## Definitions

These three plans (`net-worth-over-time.md`, `savings-rate-and-runway.md`, `spending-versus-last-period.md`) share the definitions in this section. Implement them once, in `lib/insights/`, and import them.

**Display currency.** `selectedCurrency` on the dashboard, one of `USD`, `EUR`, `SGD`. Account rows may use any `SUPPORTED_CURRENCIES` value: `HKD`, `USD`, `SGD`, `EUR`, `GBP`.

**FX (v1).** Convert with the latest snapshot from `getFxSnapshot`. Every month in the trailing expense window uses that same snapshot. This is what `/api/net-worth`, the sankey, monthly income/expenses, spending, and investment performance already do. `getFxSnapshot` reads `exchange_rates` and calls `https://open.er-api.com/v6/latest/USD` only when the cached snapshot is missing or older than 24 hours. These features add no other network call.

Using the `exchange_rates` row effective on each month-end is a follow-up. The app only reads the latest snapshot today, so a month-end rate usually does not exist. Converting this card at old rates while net cash and the sankey stay on the latest snapshot would make "kept" disagree with the chart next to it.

**Month boundaries.** Local calendar, `date-fns`.

- Default range: current month plus the two previous months, ending today (`startOfDay(subMonths(startOfMonth(now), 2))` through `endOfDay(now)`).
- Canonical parse of `yyyy-MM-dd`: the local split in `app/api/dashboard/monthly-income-expenses/route.ts`. This card uses that parse. The sankey route still uses `new Date("YYYY-MM-DD")` (UTC); the new route must not copy that.
- Months run from `startOfMonth(start)` through `startOfMonth(end)`, inclusive. Key `yyyy-MM`, label `MMM yyyy`.
- As-of for a month is `min(endOfMonth(month), range end)`.

**Income.** Sum of `transactions.amount` where `type = 'credit'` and the account's `type = 'transaction'`, converted into the display currency. Same filter as the sankey route and the monthly income route. Transfers are not income.

**Expenses.** Sum of `transactions.amount` where `type = 'debit'` and the account's `type = 'transaction'`, same conversion. This is the sankey expense node, the monthly expense bars, and the Spending tile. Insight code filters `type = 'transaction'` explicitly. `/api/dashboard/spending` omits that filter; write paths in `POST /api/transactions` and `app/api/import/transactions/route.ts` already reject other account types.

A credit-card purchase is an expense. A transfer that pays the card is not a second expense.

**Kept.** `income − expenses` over the dashboard range. That is the range form of net cash. The net cash chart does not subtract investment transfers, and this rate does not either.

**Sankey residual.** `income − max(0, investmentIn − investmentOut) − expenses` on the sankey route. It is not the savings rate. `investmentIn` is `to_amount` (fallback `amount`) on transfers from a transaction account to an investment account. `investmentOut` is `from_amount` on the reverse leg. Transfers between two investment accounts are ignored. The route clamps the displayed income, investment, and expense nodes at 0. The residual uses the raw income and expense sums and the clamped investment figure, and it may be negative.

**Liquid accounts.** `accounts.category` in `checking`, `savings`, `cash`, nature `asset`, type `transaction` or `balance`. An investment account is not liquid even if its category string is one of those three. Excluded: `credit_card`, `mortgage`, `auto_loan`, `student_loan`, `personal_loan`, `line_of_credit`, `brokerage`, `investment`, `crypto`, retirement, and property categories.

**Liabilities.** Stored as positive debt. They are not liquid. The net-worth sign rule (asset adds to assets; liability ≥ 0 adds to liabilities; negative liability adds `abs` to assets) is for the net-worth series, not for runway.

**Current balance of one account**, matching `/api/net-worth`:

- `transaction`: `calculateTransactionAccountBalance` in `lib/accounting.ts`.
- `balance`: latest `balance_history` row, or `initial_balance`.
- `investment`: latest `investment_history` row, or `0`. Not used for runway.

**Unsupported currency.** Skip those accounts, set `hasUnsupportedCurrencies`, and still compute the card from supported currencies. The net-worth hero hides entirely in this case; this card can still answer the cash question for the supported accounts, with the flag shown.

**Rounding.** Rate and runway inputs stay full-precision sums, matching sankey and monthly income. Format at display time. Do not use `roundForNetWorth` on these flows; that rounding is for the net-worth hero and its series only.

### Savings rate

Over the dashboard range, after converting each row with the latest snapshot:

```
income            = Σ credits on transaction accounts
expenses          = Σ debits on transaction accounts
kept              = income − expenses
signedInvestment  = investmentIn − investmentOut
leftInCash        = kept − signedInvestment
savingsRate       = income > 0 ? kept / income : null
```

`signedInvestment` uses the sankey's transfer filter and is not clamped. When it is positive, `leftInCash` equals the sankey residual, because the residual subtracts `max(0, signedInvestment)` from the same income and expenses. When it is negative (net withdrawal from investments), the sankey shows investment as 0 and its residual equals `kept`. This card still shows the withdrawal as a negative invested amount. The rate stays `kept / income`, which matches net cash, not the residual.

Do not label `leftInCash` "Savings". The sankey already uses that word for the residual.

The monthly route's `Math.max(0, …)` is a chart guard. The rate uses the range sums, which are what the sankey totals use before that clamp. With the positive amounts the import path writes, the sum of monthly expense bars equals `expenses`. A month whose raw debit sum is negative can make the Spending tile and this `expenses` figure differ; do not clamp the rate to hide that.

The rate follows the dashboard date range, including a partial current month, because it is a statement about the period already on screen.

### Runway

Runway does not follow the date selector. It is a today figure, like the hero.

```
liquid = Σ current balances of liquid accounts, converted, nature asset
typicalMonthlyExpenses = average of monthly expense totals
                         over the last 3 complete calendar months
                         before the current month
runwayMonths = typicalMonthlyExpenses > 0
  ? max(0, liquid) / typicalMonthlyExpenses
  : null
```

Liquid balances use the net-worth valuation above (reconstruct transaction accounts, latest `balance_history` for balance accounts). A negative checking balance reduces `liquid`. The months figure uses `max(0, liquid)` so an overdraft does not display as negative months; the raw `liquid` is still returned for the subtitle.

**Why three complete months, not six, and not the selected range.** Three months is the same horizon as the default dashboard preset, and it moves when spending changes. Six months lags and is empty more often on a new ledger. The date selector is a chart control and includes the open month; using it would shrink "typical" every time the user picks a short range, and dividing by a half month makes runway look too long. Complete months only: on 15 Oct 2026 the window is 1 Jul 2026 through 30 Sep 2026, three local calendar months, expenses defined exactly as above.

If only one or two complete months exist, average those and return the count. If none exist, `runwayMonths` is null. If the average is 0 and liquid is positive, `runwayMonths` is null and the UI says there are no recent expenses.

## Proposed design

One compact card in the existing stat row under the hero (`app/(app)/dashboard/page.tsx`, the grid that holds Budget, Spending, and Investment P/L). Not a new page. Not `financial-health-score.tsx`.

The headline is the savings rate for the selected range (one decimal, or "No income in this period"). Two secondary figures: invested (`signedInvestment`) and left in cash (`leftInCash`). A second line is runway: "4.2 months of expenses in cash", with "Based on the last 3 full months" (or N, when fewer than three exist). Runway copy must say it is not tied to the date selector. The rate subtitle names the active range so it is not read as "this month" when the preset is last 12 months.

Widen the row from three columns to a wrapping grid (`sm:grid-cols-2 xl:grid-cols-4`). Do not remove the Spending tile or the investment P/L tile.

Add `GET /api/dashboard/savings?startDate&endDate&currency`. Do not extend the sankey route. Its response is a chart contract with clamped nodes, and adding rate fields there would tempt the sankey to change meaning. The new route calls the same pure helpers the sankey should call.

In the same change, point `app/api/dashboard/cash-flow-sankey/route.ts` at those helpers for income, expenses, and the investment legs, and keep its response JSON identical (including the clamps). That is what stops the rate and the sankey from drifting. Do not change sankey labels.

No snapshot table. Both numbers are aggregates over the ledger the other dashboard routes already scan. Runway's three months are a date filter on that same scan.

Response shape:

```json
{
  "currency": "USD",
  "range": { "startDate": "2026-08-01", "endDate": "2026-10-15" },
  "income": 0,
  "expenses": 0,
  "kept": 0,
  "savingsRate": null,
  "signedInvestment": 0,
  "leftInCash": 0,
  "liquid": 0,
  "typicalMonthlyExpenses": null,
  "typicalMonthCount": 0,
  "runwayMonths": null,
  "hasUnsupportedCurrencies": false
}
```

`savingsRate` is a fraction (`0.25` for 25 percent) or `null`. `runwayMonths` is a number or `null`.

## Work breakdown

1. Import `lib/insights/range.ts` from the net-worth plan (local parse, month list). If that file is not in the tree yet, add it here with the same API. Also add `trailingCompleteMonths(now, 3)` there.
2. Add `lib/insights/flows.ts`: range income, range expenses, and signed investment legs. Inputs are already-loaded rows plus a rate map. No I/O.
3. Add liquid-balance selection next to the shared balance helper (`lib/insights/balances.ts`): category allow-list, nature `asset`, exclude `investment` type, sum converted current balances.
4. Add `app/api/dashboard/savings/route.ts`. One `getFxSnapshot`. Load accounts, transactions, transfers, and `balance_history` in parallel queries, then compute. Auth via `getEncryptionKey`.
5. Refactor `app/api/dashboard/cash-flow-sankey/route.ts` to call `lib/insights/flows.ts`, preserving its JSON and its `Math.max(0, …)` clamps on the nodes.
6. Add `components/dashboard/savings-runway-card.tsx` and place it in the stat row. Fetch from the dashboard page's existing `Promise.all` when `dateRange` or `selectedCurrency` changes. Runway ignores the range inside the route (it always uses the three complete months ending before today) but the request still sends the range because the rate needs it.
7. Add `tests/insights-savings.test.ts`. Run `pnpm test`.

Do not import `components/dashboard/financial-health-score.tsx`. Do not wire `components/dashboard/cash-flow-chart.tsx`.

## Data migration

None. `SCHEMA_VERSION` stays `1`. No new columns. Liquid is a filter on `accounts.category`, not a stored flag.

## Privacy

Computed locally against SQLCipher. The only network path is the existing `getFxSnapshot` call, shared with the rest of the dashboard fetch rather than issued a second time if the route is invoked once per page load (each route calls `getFxSnapshot`; that function returns the cached snapshot when it is younger than 24 hours, so a warm cache does not hit the network again). Do not log income, balances, or account names. Do not send the rate or runway anywhere.

## Risks and edge cases

- **Empty history.** No income in the range: `savingsRate` is null, even if expenses are positive (rate would be undefined, and a large negative percent is easy to misread). Show the kept amount as a currency figure without a percent. No complete month of expenses: hide the months number. New ledger with only the open month: runway is unavailable on purpose.
- **Income in a liability account.** A credit on a credit card (a refund logged as a credit) counts as income, because that is what the sankey does today. The rate matches the sankey income node. Do not special-case refunds in v1.
- **Mixed currencies.** Each transaction converts from its account currency with the latest snapshot, then sums. A checking account in SGD and a savings account in EUR both enter `liquid` after conversion into the display currency.
- **Liabilities.** Credit cards and mortgages are excluded from liquid even when the category was edited to something else only if the category identifier is not in the allow-list. A checking account with nature `liability` is excluded. An overdrawn asset checking account reduces liquid.
- **Investments.** Brokerage, crypto, and retirement categories are not spendable runway. Money transferred to them lowers `leftInCash` and does not lower the savings rate. A withdrawal raises `leftInCash` relative to `kept` and can make `signedInvestment` negative. The rate does not move because of the transfer alone.
- **Sankey collision.** If the UI copies the word "Savings" onto `leftInCash`, the card and the sankey agree only when net investment is positive. Use "Left in cash".
- **Missing FX.** Same failure as the other dashboard routes when there is no cached snapshot and the host is down.
- **Accounts opened mid-series.** Rate: transactions are included only when their date falls in the range, so an account opened in March contributes nothing to a January range. Runway: liquid uses the balance now, including a savings account opened yesterday. Typical expenses still come from the trailing complete months, which may predate that account. That is the right bias: runway asks what cash is on hand today against recent spending.
- **Partial current month.** Included in the rate, excluded from typical expenses.
- **Transfers into a savings account.** They do not increase the rate. They also do not change `leftInCash`, because both sides are transaction or balance accounts and the investment filter ignores them. The savings-account balance does change runway, on the next load, because runway reads balances. Those are different questions and the copy should keep them apart.
- **Zero typical expenses.** Do not divide. Show "No recent expenses".
- **Date-selector confusion.** The card sits above the selector. The rate still updates when the selector changes. The subtitle has to name the range.

## Test plan

`tests/insights-savings.test.ts` via `pnpm test`. Pure functions:

- Credits and debits on a transaction account: `kept / income` matches a hand total. A debit on a non-transaction account is ignored.
- A transfer from checking to an investment account: `savingsRate` unchanged versus the same income and expenses, `signedInvestment` equals the converted `to_amount`, `leftInCash = kept − signedInvestment`.
- Net investment withdrawal: `signedInvestment` negative, `leftInCash` greater than `kept`. Document the fixture's sankey residual as `kept` (clamped investment node is 0) so the two numbers are asserted separately.
- `income = 0` yields `savingsRate = null`.
- Liquid set: checking, savings, and cash assets included; credit card, mortgage, brokerage, and an investment account tagged `savings` excluded. Liability-nature checking excluded. Negative checking reduces the raw sum; months use the floored sum.
- Trailing window on 15 Oct 2026 is Jul, Aug, Sep, not October, and not the dashboard start date. One available complete month averages that month and sets `typicalMonthCount` to 1. Zero complete months leaves runway null.
- Latest-rate map is applied to every month in the window, including a July transaction.

Manual check once implemented: with the default last-3-months range, the card's income and expenses match the sankey nodes; "left in cash" matches the sankey Savings number when invested is positive; net cash's months sum to `kept` when no month is clamped from a negative; changing the preset changes the rate and does not change runway; the hardcoded health-score component stays unused.

## Out of scope

- Redefining the sankey Savings label or the sankey formula.
- Treating transfers into `category = 'savings'` as the savings rate.
- A six-month toggle, a chart of the rate, or a dedicated page.
- Using `financial-health-score.tsx` or `/api/dashboard/cash-flow`.
- Historical FX.
- Budget status inside this card (the Budget tile already covers the open month).
- Forecasting income or expenses.

## Rough size

M. One route, one card, and a careful split against the sankey. The aggregates already exist in nearby routes; the work is sharing them without changing those responses.
