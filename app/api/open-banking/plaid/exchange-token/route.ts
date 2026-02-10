import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  exchangePlaidPublicToken,
  getPlaidAccounts,
  getPlaidInstitution,
  PlaidApiError,
} from "@/lib/plaid-client";
import type { PlaidAccount } from "@/lib/plaid-types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { public_token } = body;

    if (!public_token) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          code: "MISSING_PARAMETERS",
          details: "public_token is required",
        },
        { status: 400 }
      );
    }

    // Exchange public token for access token
    const exchangeResponse = await exchangePlaidPublicToken(public_token);
    const { access_token, item_id } = exchangeResponse;

    console.log(`Plaid token exchanged for item: ${item_id}`);

    const db = getDb(encryptionKey);

    // Store the access token in open_banking_tokens using item_id as loginIdentityId
    const now = new Date();

    const existingToken = db
      .select()
      .from(schema.openBankingTokens)
      .where(eq(schema.openBankingTokens.loginIdentityId, item_id))
      .get();

    if (existingToken) {
      db.update(schema.openBankingTokens)
        .set({
          accessToken: access_token,
          refreshToken: "", // Plaid doesn't use refresh tokens (access tokens are long-lived)
          updatedAt: now,
        })
        .where(eq(schema.openBankingTokens.loginIdentityId, item_id))
        .run();
    } else {
      db.insert(schema.openBankingTokens)
        .values({
          loginIdentityId: item_id,
          accessToken: access_token,
          refreshToken: "",
          connectedAt: now,
          updatedAt: now,
        })
        .run();
    }

    // Fetch accounts for this item
    const accountsResponse = await getPlaidAccounts(access_token);

    // Try to get institution name
    let institutionId = accountsResponse.item.institution_id;
    let institutionName = "";

    if (institutionId) {
      try {
        const institutionResponse = await getPlaidInstitution(institutionId);
        institutionName = institutionResponse.institution.name;
      } catch (err) {
        console.warn("Failed to fetch institution details:", err);
      }
    }

    // Enhance accounts with item_id and institution info
    const enhancedAccounts: PlaidAccount[] = accountsResponse.accounts.map(
      (account) => ({
        ...account,
        item_id,
        institution_id: institutionId || undefined,
        institution_name: institutionName || undefined,
        connection_metadata: {
          plaid: {
            item_id,
            account_id: account.account_id,
            institution_id: institutionId || undefined,
            institution_name: institutionName || undefined,
            connection_status: "active",
            connected_at: now.toISOString(),
          },
        },
      })
    );

    return NextResponse.json({
      accounts: enhancedAccounts,
      item_id,
      institution: {
        institution_id: institutionId,
        institution_name: institutionName,
      },
    });
  } catch (error) {
    console.error("Error exchanging Plaid token:", error);

    if (error instanceof PlaidApiError) {
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
