import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { makeAuthenticatedFinverseRequest } from "@/lib/finverse-token-refresh";
import { getFinverseClientToken } from "@/lib/finverse-client";
import type { FinverseAccount } from "@/lib/finverse-types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { code, login_identity_id } = body;

    // Support both code (initial connection) and login_identity_id (polling/refresh)
    if (!code && !login_identity_id) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        code: "MISSING_PARAMETERS",
        details: "Either code or login_identity_id is required"
      }, { status: 400 });
    }

    const db = getDb(encryptionKey);
    let loginIdentityId: string;

    // If login_identity_id is provided, use existing token (for polling)
    if (login_identity_id) {
      loginIdentityId = login_identity_id;
      // Verify token exists
      const existingToken = db.select()
        .from(schema.openBankingTokens)
        .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
        .get();
      
      if (!existingToken) {
        return NextResponse.json({ 
          error: "No token found for this login identity", 
          code: "TOKEN_NOT_FOUND" 
        }, { status: 404 });
      }
      console.log(`✅ Using existing token for login identity: ${loginIdentityId}`);
    } else {
      // Initial connection flow: exchange code for tokens
      const clientId = process.env.FINVERSE_CLIENT_ID;
      const clientSecret = process.env.FINVERSE_SECRET;
      const appId = process.env.FINVERSE_APP_ID;

      if (!clientId || !clientSecret || !appId) {
        return NextResponse.json({ 
          error: "Missing environment variables", 
          code: "CONFIG_ERROR" 
        }, { status: 500 });
      }

      // Get relay URL from env (if configured)
      const relayUrl = process.env.NEXT_PUBLIC_OAUTH_RELAY_URL;
      
      // Determine final redirect target (where user should end up)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL 
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` 
          : "http://localhost:8528");

      // Use relay if configured, otherwise direct (for testing)
      // Must match the redirect_uri used in get-link-ui-url
      const redirectUri = relayUrl 
        ? `${relayUrl}/callback`
        : `${appUrl}/accounts/connect`;

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

      // Exchange authorization code for user access token
      // redirect_uri must match the one used in get-link-ui-url
      const userAccessTokenResponse = await fetch("https://api.prod.finverse.net/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${clientTokenResult.accessToken}`,
        },
        body: new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          code: code!,
          user_id: userId,
          grant_type: "authorization_code",
        }),
      });

      if (!userAccessTokenResponse.ok) {
        const errorData = await userAccessTokenResponse.json().catch(() => ({ error: "Invalid response format" }));
        console.error("Failed to get user access token:", errorData);
        return NextResponse.json({ 
          error: "Failed to exchange authorization code", 
          code: "TOKEN_EXCHANGE_FAILED",
          details: errorData
        }, { status: 400 });
      }

      const userAccessTokenData = await userAccessTokenResponse.json();

      const userAccessToken = userAccessTokenData.access_token;
      const userRefreshToken = userAccessTokenData.refresh_token;
      loginIdentityId = userAccessTokenData.login_identity_id;

      if (!userAccessToken) {
        return NextResponse.json({ 
          error: "No access token received", 
          code: "NO_ACCESS_TOKEN" 
        }, { status: 400 });
      }

      if (!loginIdentityId) {
        return NextResponse.json({ 
          error: "No login identity ID received", 
          code: "NO_LOGIN_IDENTITY_ID" 
        }, { status: 400 });
      }

      console.log(`✅ Received tokens for login identity: ${loginIdentityId}`);

      // Store user access token and refresh token by login_identity_id in SQLite
      const now = new Date();
      
      // Check if token already exists
      const existingToken = db.select()
        .from(schema.openBankingTokens)
        .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
        .get();

      if (existingToken) {
        // Update existing token
        db.update(schema.openBankingTokens)
          .set({
            accessToken: userAccessToken,
            refreshToken: userRefreshToken,
            updatedAt: now
          })
          .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
          .run();
      } else {
        // Insert new token
        db.insert(schema.openBankingTokens)
          .values({
            loginIdentityId,
            accessToken: userAccessToken,
            refreshToken: userRefreshToken,
            connectedAt: now,
            updatedAt: now
          })
          .run();
      }
    }

    // Get accounts using authenticated request with automatic token refresh
    const accountsResponse = await makeAuthenticatedFinverseRequest(
      encryptionKey,
      loginIdentityId,
      "https://api.prod.finverse.net/accounts",
      {
        method: "GET",
      }
    );

    if (!accountsResponse.ok) {
      const errorData = await accountsResponse.json().catch(() => ({ error: "Invalid response format" }));
      console.error("Failed to fetch accounts:", errorData);
      return NextResponse.json({ 
        error: "Failed to fetch accounts", 
        code: "ACCOUNTS_FETCH_FAILED",
        details: errorData
      }, { status: 400 });
    }

    const accountsData = await accountsResponse.json();
    
    // Enhance account data with login_identity_id for client-side account creation
    const enhancedAccountsData = {
      ...accountsData,
      accounts: accountsData.accounts?.map((account: FinverseAccount) => ({
        ...account,
        login_identity_id: loginIdentityId,
        connection_metadata: {
          finverse: {
            login_identity_id: loginIdentityId,
            account_id: account.account_id,
            connection_status: "active",
            connected_at: new Date().toISOString()
          }
        }
      })) || []
    };
    
    return NextResponse.json(enhancedAccountsData);

  } catch (error) {
    console.error("Error in fetchAccounts:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
