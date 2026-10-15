import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isSupportedCurrency, type SupportedCurrency } from "@/lib/currencies";
import { getFxSnapshot } from "@/lib/fx";
import { buildSavingsInsight } from "@/lib/insights/savings";
import { parseLocalDate, parseLocalEndDate } from "@/lib/insights/range";

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

    const start = parseLocalDate(startDateParam);
    const end = parseLocalEndDate(endDateParam);
    if (!start || !end) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const currency: SupportedCurrency = currencyParam;
    const db = getDb(key);
    const fxPromise = getFxSnapshot(db);
    const rowsPromise = Promise.all([
      Promise.resolve().then(() => db.select().from(schema.accounts).all()),
      Promise.resolve().then(() => db.select().from(schema.transactions).all()),
      Promise.resolve().then(() => db.select().from(schema.transfers).all()),
      Promise.resolve().then(() => db.select().from(schema.balanceHistory).all()),
    ]);

    const [fxSnapshot, [accounts, transactions, transfers, balanceHistory]] = await Promise.all([
      fxPromise,
      rowsPromise,
    ]);

    const insight = buildSavingsInsight({
      accounts,
      transactions,
      transfers,
      balanceHistory,
      start,
      end,
      startDate: startDateParam,
      endDate: endDateParam,
      currency,
      rates: fxSnapshot.rates,
      now: new Date(),
    });

    return NextResponse.json(insight);
  } catch (error) {
    console.error("Error calculating savings rate:", error);
    return NextResponse.json({ error: "Failed to calculate savings rate" }, { status: 500 });
  }
};
