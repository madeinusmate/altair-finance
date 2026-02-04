import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        code: "MISSING_PARAMETERS",
        details: "accountId is required"
      }, { status: 400 });
    }

    const db = getDb(encryptionKey);

    // Get account
    const account = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Parse metadata
    const accountMetadata = account.metadata ? JSON.parse(account.metadata) : {};
    const finverseMetadata = accountMetadata.finverse || {};
    const loginIdentityId = finverseMetadata.login_identity_id;

    // Remove Finverse metadata from account
    delete accountMetadata.finverse;

    db.update(schema.accounts)
      .set({
        metadata: JSON.stringify(accountMetadata),
        updatedAt: new Date()
      })
      .where(eq(schema.accounts.id, accountId))
      .run();

    // Optionally remove token if no other accounts use this login_identity_id
    if (loginIdentityId) {
      // Check if any other accounts use this login_identity_id
      const accountsWithSameLogin = db.select()
        .from(schema.accounts)
        .all()
        .filter(acc => {
          if (!acc.metadata) return false;
          try {
            const meta = JSON.parse(acc.metadata);
            return meta?.finverse?.login_identity_id === loginIdentityId;
          } catch {
            return false;
          }
        });

      // If no other accounts use this login_identity_id, remove the token
      if (accountsWithSameLogin.length === 0) {
        db.delete(schema.openBankingTokens)
          .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
          .run();
        console.log(`Removed token for login_identity_id ${loginIdentityId} (no accounts using it)`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Account disconnected successfully"
    });

  } catch (error) {
    console.error("Error in disconnect:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
