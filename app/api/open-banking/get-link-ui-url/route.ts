import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getFinverseClientToken } from "@/lib/finverse-client";
import { getEncryptionKey } from "@/lib/api-utils";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clientId = process.env.FINVERSE_CLIENT_ID;
    const clientSecret = process.env.FINVERSE_SECRET;
    const appId = process.env.FINVERSE_APP_ID;

    if (!clientId || !clientSecret || !appId) {
      return NextResponse.json({ 
        error: "Missing environment variables", 
        code: "CONFIG_ERROR" 
      }, { status: 500 });
    }

    // Get client credentials token
    const clientTokenResult = await getFinverseClientToken(encryptionKey);
    
    if (!clientTokenResult.success || !clientTokenResult.accessToken) {
      return NextResponse.json({ 
        error: "Failed to get client credentials token", 
        code: "CLIENT_TOKEN_FAILED",
        details: clientTokenResult.error
      }, { status: 500 });
    }

    console.log("✅ Client credentials token obtained via service");

    // Generate a stable user_id from the encryption key (hash it for privacy)
    const userId = createHash("sha256").update(encryptionKey).digest("hex").substring(0, 32);

    // Determine app URL - prefer tunnel URL for HTTPS OAuth callbacks
    let appUrl = process.env.NEXT_PUBLIC_APP_URL;
    
    if (!appUrl) {
      // Check for tunnel URL (set by Electron or manually)
      appUrl = process.env.TUNNEL_URL || 
        (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL 
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` 
          : null);
    }
    
    // Fallback to localhost (will fail for OAuth but useful for testing)
    if (!appUrl) {
      appUrl = "http://localhost:8528";
      console.warn("[Open Banking] No HTTPS URL configured. OAuth callbacks may fail. Set TUNNEL_URL or NEXT_PUBLIC_APP_URL.");
    }

    // Generate link UI URL
    const linkTokenResponse = await fetch("https://api.prod.finverse.net/link/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${clientTokenResult.accessToken}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: `${appUrl}/accounts/connect`,
        state: `${appId}_stateparameter`,
        user_id: userId,
        grant_type: "client_credentials",
        response_mode: "form_post",
        response_type: "code",
        automatic_data_refresh: "ON",
        link_mode: "real test",
        language: "en",
        products_requested: ["TRANSACTIONS", "STATEMENTS", "ACCOUNTS"],
        ui_mode: "redirect",
        user_type: [],
      }),
    });

    if (!linkTokenResponse.ok) {
      const errorData = await linkTokenResponse.json().catch(() => ({ error: "Invalid response format" }));
      console.error("Failed to get link UI URL:", errorData);
      return NextResponse.json({ 
        error: "Failed to get link UI URL", 
        code: "LINK_URL_FAILED",
        details: errorData
      }, { status: 400 });
    }

    const linkUiUrlData = await linkTokenResponse.json();
    
    if (!linkUiUrlData.link_url) {
      return NextResponse.json({ 
        error: "No link URL received", 
        code: "NO_LINK_URL" 
      }, { status: 400 });
    }
    
    return NextResponse.json({ link_url: linkUiUrlData.link_url });

  } catch (error) {
    console.error("Error in getLinkUiUrl:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
