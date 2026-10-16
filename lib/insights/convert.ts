import { isSupportedCurrency, type SupportedCurrency } from "@/lib/currencies";
import { convertAmount } from "@/lib/fx";

export type UnsupportedCurrencyMode = "skip" | "throw";

export const convertLedgerAmount = (
  amount: number,
  fromCurrency: string,
  toCurrency: SupportedCurrency,
  rates: Record<SupportedCurrency, number>,
  unsupported: UnsupportedCurrencyMode,
): { amount: number; skipped: boolean } => {
  if (!isSupportedCurrency(fromCurrency)) {
    if (unsupported === "throw") {
      return {
        amount: convertAmount(amount, fromCurrency as SupportedCurrency, toCurrency, rates),
        skipped: false,
      };
    }
    return { amount: 0, skipped: true };
  }

  return {
    amount: convertAmount(amount, fromCurrency, toCurrency, rates),
    skipped: false,
  };
};
