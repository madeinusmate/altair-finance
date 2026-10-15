import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isSupportedCurrency } from "@/lib/currencies";
import { getFxSnapshot } from "@/lib/fx";
import { parseLocalDateRange } from "@/lib/insights/range";
import { buildNetWorthSeries, type NetWorthHistory } from "@/lib/insights/net-worth-series";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const currencyParam = searchParams.get("currency") || "USD";

    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    if (!isSupportedCurrency(currencyParam)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const range = parseLocalDateRange(startDateParam, endDateParam);
    if (!range) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    const accounts = db.select().from(schema.accounts).all();
    const transactions = db.select().from(schema.transactions).all();
    const transfers = db.select().from(schema.transfers).all();
    const balanceHistory = db.select().from(schema.balanceHistory).all();
    const investmentHistory = db.select().from(schema.investmentHistory).all();

    const series = buildNetWorthSeries({
      accounts,
      transactions,
      transfers,
      balanceHistory,
      investmentHistory,
      start: range.start,
      end: range.end,
      currency: currencyParam,
      rates: fxSnapshot.rates,
    });

    const body: NetWorthHistory = {
      currency: currencyParam,
      points: series.points,
      hasUnsupportedCurrencies: series.hasUnsupportedCurrencies,
      unsupportedCurrencies: series.unsupportedCurrencies,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("Error calculating net worth history:", error);
    return NextResponse.json({ error: "Failed to calculate net worth history" }, { status: 500 });
  }
};
