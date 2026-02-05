import { NextRequest, NextResponse } from "next/server";
import { getEncryptionKey } from "@/lib/api-utils";
import { makeAuthenticatedFinverseRequest } from "@/lib/finverse-token-refresh";
import type { FinverseTransactionsResponse } from "@/lib/finverse-types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      accountId, 
      loginIdentityId,
      limit = 100,
      offset = 0,
      from_booking_date_time,
      to_booking_date_time,
    } = body;

    if (!accountId || !loginIdentityId) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        code: "MISSING_PARAMETERS",
        details: "accountId and loginIdentityId are required"
      }, { status: 400 });
    }

    // Build API URL with pagination and date filter parameters
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (from_booking_date_time) {
      params.append("from_booking_date_time", from_booking_date_time);
    }
    if (to_booking_date_time) {
      params.append("to_booking_date_time", to_booking_date_time);
    }

    const apiUrl = `https://api.prod.finverse.net/transactions/${accountId}?${params.toString()}`;
    console.log(`🌐 Finverse API URL: ${apiUrl}`);

    // Use authenticated request with automatic token refresh
    let transactionsResponse: Response;
    
    try {
      transactionsResponse = await makeAuthenticatedFinverseRequest(
        encryptionKey,
        loginIdentityId,
        apiUrl,
        {
          method: "GET",
        }
      );
    } catch (error) {
      // Check if it's a token-related error
      if (error instanceof Error && error.message.includes("reconnect")) {
        return NextResponse.json({ 
          error: error.message, 
          code: "AUTHENTICATION_REQUIRED",
          details: "User needs to reconnect their bank account"
        }, { status: 401 });
      }
      
      return NextResponse.json({ 
        error: "Failed to authenticate with banking provider", 
        code: "AUTHENTICATION_FAILED",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    if (!transactionsResponse.ok) {
      const errorData = await transactionsResponse.json().catch(() => ({ 
        error: "Failed to parse error response" 
      }));
      
      return NextResponse.json({ 
        error: "Failed to fetch transactions", 
        code: "TRANSACTIONS_FETCH_FAILED",
        details: errorData
      }, { status: 400 });
    }

    const transactionsData: FinverseTransactionsResponse = await transactionsResponse.json();
    
    console.log(`📊 Finverse API Response:`, {
      total_transactions: transactionsData.total_transactions,
      transactions_count: transactionsData.transactions?.length || 0,
      account_id: transactionsData.account_id,
    });

    // Filter out pending transactions
    const allTransactions = transactionsData.transactions || [];
    const filteredTransactions = allTransactions.filter(
      tx => !tx.is_pending
    );
    
    const pendingCount = allTransactions.length - filteredTransactions.length;
    console.log(`✅ Filtered transactions: ${filteredTransactions.length} posted, ${pendingCount} pending (filtered out)`);

    return NextResponse.json({
      ...transactionsData,
      transactions: filteredTransactions,
      // Keep original total_transactions from Finverse (includes pending)
      // The filtered transactions array contains only non-pending transactions
    });

  } catch (error) {
    console.error("Error in fetchTransactions:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
