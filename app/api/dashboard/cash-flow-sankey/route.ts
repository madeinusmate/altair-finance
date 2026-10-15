import { NextRequest, NextResponse } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { type SupportedCurrency } from "@/lib/currencies";
import { getFxSnapshot } from "@/lib/fx";
import { computeRangeFlows, toSankeyNodes } from "@/lib/insights/flows";

interface CashFlowSankeyData {
  income: number;
  investment: number;
  savings: number;
  expenses: number;
  currency: string;
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;

    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    const accounts = db.select().from(schema.accounts).all();
    const transactions = db
      .select()
      .from(schema.transactions)
      .where(and(gte(schema.transactions.date, startDate), lte(schema.transactions.date, endDate)))
      .all();
    const transfers = db
      .select()
      .from(schema.transfers)
      .where(and(gte(schema.transfers.date, startDate), lte(schema.transfers.date, endDate)))
      .all();

    const flows = computeRangeFlows({
      accounts,
      transactions,
      transfers,
      start: startDate,
      end: endDate,
      currency,
      rates: fxSnapshot.rates,
      unsupported: "throw",
    });
    const nodes = toSankeyNodes(flows);

    const result: CashFlowSankeyData = {
      income: nodes.income,
      investment: nodes.investment,
      savings: nodes.savings,
      expenses: nodes.expenses,
      currency,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating cash flow Sankey data:", error);
    return NextResponse.json({ error: "Failed to calculate cash flow" }, { status: 500 });
  }
};
