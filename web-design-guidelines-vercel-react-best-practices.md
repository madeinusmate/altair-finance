## Multi-Currency Net Worth Spec

### Scope
- Net worth is calculated across all accounts and converted into USD, EUR, and SGD.
- Account balances remain stored in their original account currency.
- Net worth is disabled until every account uses a supported currency (HKD, USD, SGD, EUR, GBP).

### FX Rates
- Provider: `open.er-api.com` (USD base).
- Storage: daily snapshots persisted in `exchange_rates` with 6-decimal precision.
- Refresh: on-demand when net worth is requested and rates are stale (>24h).
- Failure mode: fall back to last known rates, mark as stale in UI.

### Conversion Rules
- Each account balance is converted to the target currency using USD as the base.
- Rounding is applied per account conversion (0 decimals for >= 1,000,000; else 2 decimals).
- Net worth totals are the sum of rounded per-account conversions.

### UI/UX
- Net Worth shows a segmented control for USD/EUR/SGD, default USD.
- A single Net Worth card shows net worth, assets, liabilities, and investment P/L.
- Rates show a last-updated timestamp and stale indicator when applicable.
- Inline banner prompts users to update unsupported account currencies.

### Account Currency Editing
- Supported currencies are restricted to HKD, USD, SGD, EUR, GBP.
- Changing an account’s currency converts all related records (balances, history, transactions, transfers, investment history) when both old/new currencies are supported.
- Cross-currency transfers are disallowed.
