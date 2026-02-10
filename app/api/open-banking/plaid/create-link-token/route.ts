import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getEncryptionKey } from "@/lib/api-utils";
import { createPlaidLinkToken, PlaidApiError } from "@/lib/plaid-client";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      return NextResponse.json(
        {
          error: "Missing Plaid environment variables",
          code: "CONFIG_ERROR",
        },
        { status: 500 }
      );
    }

    // Generate a stable user_id from the encryption key (hash it for privacy)
    const clientUserId = createHash("sha256")
      .update(encryptionKey)
      .digest("hex")
      .substring(0, 32);

    const linkTokenResponse = await createPlaidLinkToken(clientUserId);

    console.log("Plaid link token created successfully");

    return NextResponse.json({
      link_token: linkTokenResponse.link_token,
      expiration: linkTokenResponse.expiration,
    });
  } catch (error) {
    console.error("Error creating Plaid link token:", error);

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
