import { v4 as uuidv4 } from "uuid";
import { and, desc, eq } from "drizzle-orm";
import { BASE_CURRENCY, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";
import { schema } from "@/lib/db";

const FX_API_URL = "https://open.er-api.com/v6/latest/USD";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type FxSnapshot = {
  rates: Record<SupportedCurrency, number>;
  effectiveDate: Date;
  isStale: boolean;
  usedFallback: boolean;
  source: string;
};

const isStale = (date: Date): boolean => {
  return Date.now() - date.getTime() > STALE_AFTER_MS;
};

const buildRatesMap = (rates: Record<string, number>): Record<SupportedCurrency, number> => {
  return SUPPORTED_CURRENCIES.reduce<Record<SupportedCurrency, number>>((acc, currency) => {
    const value = rates[currency];
    if (typeof value !== "number") {
      throw new Error(`Missing rate for ${currency}`);
    }
    acc[currency] = value;
    return acc;
  }, {} as Record<SupportedCurrency, number>);
};

const fetchLatestRates = async (): Promise<{ rates: Record<SupportedCurrency, number>; effectiveDate: Date; source: string }> => {
  const response = await fetch(FX_API_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch FX rates: ${response.statusText}`);
  }

  const data = await response.json();
  if (data?.result !== "success" || !data?.rates) {
    throw new Error("Invalid FX response");
  }

  const rates = buildRatesMap(data.rates as Record<string, number>);
  const effectiveDate = new Date(Number(data.time_last_update_unix) * 1000);

  return { rates, effectiveDate, source: "open.er-api.com" };
};

const getLatestSnapshotFromDb = (db: ReturnType<typeof import("@/lib/db").getDb>) => {
  const latest = db
    .select({ effectiveDate: schema.exchangeRates.effectiveDate })
    .from(schema.exchangeRates)
    .where(eq(schema.exchangeRates.baseCurrency, BASE_CURRENCY))
    .orderBy(desc(schema.exchangeRates.effectiveDate))
    .limit(1)
    .get();

  if (!latest?.effectiveDate) {
    return null;
  }

  const rows = db
    .select()
    .from(schema.exchangeRates)
    .where(
      and(
        eq(schema.exchangeRates.baseCurrency, BASE_CURRENCY),
        eq(schema.exchangeRates.effectiveDate, latest.effectiveDate)
      )
    )
    .all();

  const rates = SUPPORTED_CURRENCIES.reduce<Record<SupportedCurrency, number>>((acc, currency) => {
    const row = rows.find((item) => item.quoteCurrency === currency);
    if (!row) {
      return acc;
    }
    acc[currency] = Number.parseFloat(row.rate);
    return acc;
  }, {} as Record<SupportedCurrency, number>);

  if (SUPPORTED_CURRENCIES.some((currency) => typeof rates[currency] !== "number")) {
    return null;
  }

  return {
    rates,
    effectiveDate: new Date(latest.effectiveDate),
    source: "db",
  };
};

const storeSnapshot = (
  db: ReturnType<typeof import("@/lib/db").getDb>,
  snapshot: { rates: Record<SupportedCurrency, number>; effectiveDate: Date; source: string }
): void => {
  const createdAt = new Date();
  const effectiveDate = snapshot.effectiveDate;

  const rows = SUPPORTED_CURRENCIES.map((currency) => ({
    id: uuidv4(),
    baseCurrency: BASE_CURRENCY,
    quoteCurrency: currency,
    rate: snapshot.rates[currency].toFixed(6),
    effectiveDate,
    createdAt,
  }));

  db.insert(schema.exchangeRates).values(rows).run();
};

export const getFxSnapshot = async (db: ReturnType<typeof import("@/lib/db").getDb>): Promise<FxSnapshot> => {
  const existing = getLatestSnapshotFromDb(db);
  const existingIsStale = existing ? isStale(existing.effectiveDate) : true;

  if (!existingIsStale && existing) {
    return {
      rates: existing.rates,
      effectiveDate: existing.effectiveDate,
      isStale: false,
      usedFallback: false,
      source: existing.source,
    };
  }

  try {
    const latest = await fetchLatestRates();
    storeSnapshot(db, latest);
    return {
      rates: latest.rates,
      effectiveDate: latest.effectiveDate,
      isStale: false,
      usedFallback: false,
      source: latest.source,
    };
  } catch (error) {
    if (existing) {
      return {
        rates: existing.rates,
        effectiveDate: existing.effectiveDate,
        isStale: true,
        usedFallback: true,
        source: existing.source,
      };
    }
    throw error;
  }
};

export const convertAmount = (
  amount: number,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  rates: Record<SupportedCurrency, number>
): number => {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!fromRate || !toRate) {
    throw new Error(`Missing FX rate for ${fromCurrency} or ${toCurrency}`);
  }

  const amountInUsd = fromCurrency === BASE_CURRENCY ? amount : amount / fromRate;
  return toCurrency === BASE_CURRENCY ? amountInUsd : amountInUsd * toRate;
};
