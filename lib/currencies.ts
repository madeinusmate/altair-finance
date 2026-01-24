export const SUPPORTED_CURRENCIES = ["HKD", "USD", "SGD", "EUR", "GBP"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const BASE_CURRENCY = "USD" as const;
export const TARGET_NET_WORTH_CURRENCIES = ["USD", "EUR", "SGD"] as const;
export const DEFAULT_ACCOUNT_CURRENCY = "SGD" as const;

export const isSupportedCurrency = (currency: string): currency is SupportedCurrency => {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
};
