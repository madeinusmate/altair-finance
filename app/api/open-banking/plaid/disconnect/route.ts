import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { removePlaidItem, PlaidApiError } from "@/lib/plaid-client";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          code: "MISSING_PARAMETERS",
          details: "accountId is required",
        },
        { status: 400 }
      );
    }

    const db = getDb(encryptionKey);

    // Get account
    const account = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Parse metadata
    const accountMetadata = account.metadata
      ? JSON.parse(account.metadata)
      : {};
    const plaidMetadata = accountMetadata.plaid || {};
    const itemId = plaidMetadata.item_id;

    if (!itemId) {
      return NextResponse.json(
        {
          error: "Account is not connected via Plaid",
          code: "NOT_PLAID_ACCOUNT",
        },
        { status: 400 }
      );
    }

    // Get access token and try to remove the Plaid item
    const tokenRecord = db
      .select()
      .from(schema.openBankingTokens)
      .where(eq(schema.openBankingTokens.loginIdentityId, itemId))
      .get();

    if (tokenRecord) {
      try {
        await removePlaidItem(tokenRecord.accessToken);
        console.log(`Plaid item ${itemId} removed successfully`);
      } catch (err) {
        // Log but don't fail - the item may already be removed on Plaid's side
        if (err instanceof PlaidApiError) {
          console.warn(
            `Failed to remove Plaid item ${itemId}: ${err.errorCode} - ${err.message}`
          );
        } else {
          console.warn(`Failed to remove Plaid item ${itemId}:`, err);
        }
      }
    }

    // Remove Plaid metadata from account
    delete accountMetadata.plaid;
    delete accountMetadata.provider;

    db.update(schema.accounts)
      .set({
        metadata: JSON.stringify(accountMetadata),
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId))
      .run();

    // Remove token if no other accounts use this item_id
    if (itemId) {
      const accountsWithSameItem = db
        .select()
        .from(schema.accounts)
        .all()
        .filter((acc) => {
          if (!acc.metadata) return false;
          try {
            const meta = JSON.parse(acc.metadata);
            return meta?.plaid?.item_id === itemId;
          } catch {
            return false;
          }
        });

      if (accountsWithSameItem.length === 0) {
        db.delete(schema.openBankingTokens)
          .where(eq(schema.openBankingTokens.loginIdentityId, itemId))
          .run();
        console.log(
          `Removed token for Plaid item ${itemId} (no accounts using it)`
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Account disconnected successfully",
    });
  } catch (error) {
    console.error("Error in Plaid disconnect:", error);
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
