export const SUPPORTED_CURRENCIES = ["HKD", "USD", "SGD", "EUR", "GBP"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const BASE_CURRENCY = "USD" as const;
export const DEFAULT_ACCOUNT_CURRENCY = "SGD" as const;

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  HKD: "Hong Kong dollar",
  USD: "US dollar",
  SGD: "Singapore dollar",
  EUR: "Euro",
  GBP: "British pound",
};

export const isSupportedCurrency = (currency: string): currency is SupportedCurrency => {
  return SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency);
};

export const parseEnabledCurrencies = (
  value: unknown
): { ok: true; currencies: SupportedCurrency[] } | { ok: false; error: string } => {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Keep at least one currency enabled." };
  }

  for (const item of value) {
    if (typeof item !== "string" || !isSupportedCurrency(item.trim().toUpperCase())) {
      return { ok: false, error: "Choose a supported currency." };
    }
  }

  const selected = new Set(value.map((item) => (item as string).trim().toUpperCase()));
  return {
    ok: true,
    currencies: SUPPORTED_CURRENCIES.filter((currency) => selected.has(currency)),
  };
};

export const readEnabledCurrencies = (stored: string | null | undefined): SupportedCurrency[] => {
  if (!stored) {
    return [...SUPPORTED_CURRENCIES];
  }

  try {
    const parsed = parseEnabledCurrencies(JSON.parse(stored));
    return parsed.ok ? parsed.currencies : [...SUPPORTED_CURRENCIES];
  } catch {
    return [...SUPPORTED_CURRENCIES];
  }
};

export const serializeEnabledCurrencies = (currencies: readonly SupportedCurrency[]): string => {
  return JSON.stringify(SUPPORTED_CURRENCIES.filter((currency) => currencies.includes(currency)));
};

export const withHomeCurrency = (
  enabled: readonly SupportedCurrency[],
  preferred: SupportedCurrency | null
): SupportedCurrency[] => {
  return SUPPORTED_CURRENCIES.filter(
    (currency) => enabled.includes(currency) || currency === preferred
  );
};

export const orderWithDefault = (
  currencies: readonly SupportedCurrency[],
  preferred: SupportedCurrency | null
): SupportedCurrency[] => {
  if (!preferred || !currencies.includes(preferred)) {
    return [...currencies];
  }
  return [preferred, ...currencies.filter((currency) => currency !== preferred)];
};

export const pickDisplayCurrency = (
  enabled: readonly SupportedCurrency[],
  preferred: string | null | undefined
): SupportedCurrency => {
  if (preferred && isSupportedCurrency(preferred) && enabled.includes(preferred)) {
    return preferred;
  }
  return enabled[0] ?? SUPPORTED_CURRENCIES[0];
};
