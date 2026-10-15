import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { loadMonthBudget } from "@/lib/budget/month-summary";
import { currentYearMonth } from "@/lib/budget/resolve-month";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);
    const month = currentYearMonth();
    const summary = loadMonthBudget(db, month, currency, fxSnapshot);

    let status: "under" | "approaching" | "over";
    if (summary.overallPercentageUsed > 100) {
      status = "over";
    } else if (summary.overallPercentageUsed >= 75) {
      status = "approaching";
    } else {
      status = "under";
    }

    return NextResponse.json({
      overallBudget: summary.overallBudget,
      overallSpent: summary.overallSpent,
      overallRemaining: summary.overallRemaining,
      overallPercentageUsed: summary.overallPercentageUsed,
      unbudgetedSpent: summary.unbudgetedSpent,
      currency: summary.currency,
      status,
      month: summary.month,
      pace: summary.pace,
    });
  } catch (error) {
    console.error("Error fetching budget summary:", error);
    return NextResponse.json({ error: "Failed to fetch budget summary" }, { status: 500 });
  }
};
