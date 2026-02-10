import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { getPlaidTransactions, PlaidApiError } from "@/lib/plaid-client";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      itemId,
      accountId,
      startDate,
      endDate,
      count = 100,
      offset = 0,
    } = body;

    // Plaid enforces count in [1, 500]
    const clampedCount = Math.min(Math.max(count, 1), 500);

    if (!itemId) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          code: "MISSING_PARAMETERS",
          details: "itemId is required",
        },
        { status: 400 }
      );
    }

    const db = getDb(encryptionKey);

    // Get the access token for this item
    const tokenRecord = db
      .select()
      .from(schema.openBankingTokens)
      .where(eq(schema.openBankingTokens.loginIdentityId, itemId))
      .get();

    if (!tokenRecord) {
      return NextResponse.json(
        {
          error: "No token found for this Plaid item",
          code: "TOKEN_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    // Default date range: last 2 years if not specified
    const now = new Date();
    const defaultStartDate = new Date(now);
    defaultStartDate.setFullYear(defaultStartDate.getFullYear() - 2);

    const start = startDate || defaultStartDate.toISOString().split("T")[0];
    const end = endDate || now.toISOString().split("T")[0];

    console.log(
      `Fetching Plaid transactions for item ${itemId}, account ${accountId || "all"}, date range: ${start} to ${end}`
    );

    const transactionsResponse = await getPlaidTransactions(
      tokenRecord.accessToken,
      start,
      end,
      {
        ...(accountId && { account_ids: [accountId] }),
        count: clampedCount,
        offset,
      }
    );

    // Filter out pending transactions
    const allTransactions = transactionsResponse.transactions || [];
    const filteredTransactions = allTransactions.filter((tx) => !tx.pending);

    const pendingCount = allTransactions.length - filteredTransactions.length;
    console.log(
      `Plaid transactions: ${filteredTransactions.length} posted, ${pendingCount} pending (filtered out)`
    );

    return NextResponse.json({
      transactions: filteredTransactions,
      total_transactions: transactionsResponse.total_transactions,
      accounts: transactionsResponse.accounts,
    });
  } catch (error) {
    console.error("Error fetching Plaid transactions:", error);

    if (error instanceof PlaidApiError) {
      // Handle PRODUCT_NOT_READY error (transactions not yet available after connection)
      if (error.errorCode === "PRODUCT_NOT_READY") {
        return NextResponse.json(
          {
            error:
              "Transactions are not yet available. Please try again in a few moments.",
            code: "PRODUCT_NOT_READY",
          },
          { status: 202 }
        );
      }

      return NextResponse.json(
        {
          error: error.displayMessage || error.message,
          code: error.errorCode,
          details: {
            error_type: error.errorType,
            request_id: error.requestId,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
