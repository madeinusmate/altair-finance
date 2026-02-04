import { NextRequest, NextResponse } from "next/server";
import { getEncryptionKey } from "@/lib/api-utils";
import { refreshFinverseToken } from "@/lib/finverse-token-refresh";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { loginIdentityId } = body;

    if (!loginIdentityId) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        code: "MISSING_PARAMETERS",
        details: "loginIdentityId is required"
      }, { status: 400 });
    }

    const result = await refreshFinverseToken(encryptionKey, loginIdentityId);

    if (!result.success) {
      return NextResponse.json({
        error: result.error || "Token refresh failed",
        code: "TOKEN_REFRESH_FAILED"
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Token refreshed successfully"
    });

  } catch (error) {
    console.error("Error in refreshToken:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
