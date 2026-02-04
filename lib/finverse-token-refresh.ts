import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { getFinverseClientToken } from "./finverse-client";

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Refreshes the Finverse access token using the stored refresh token
 * Based on Finverse documentation: https://docs.finverse.com/
 */
export const refreshFinverseToken = async (
  encryptionKey: string,
  loginIdentityId: string
): Promise<TokenRefreshResult> => {
  try {
    const db = getDb(encryptionKey);
    
    // Get stored tokens for the specific login identity
    const tokenRecord = db.select()
      .from(schema.openBankingTokens)
      .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
      .get();

    if (!tokenRecord) {
      return {
        success: false,
        error: `No refresh token found for login identity ${loginIdentityId}. User needs to reconnect their bank account.`
      };
    }

    const refreshToken = tokenRecord.refreshToken;

    console.log(`🔄 Refreshing access token for login identity ${loginIdentityId}`);

    // Get client credentials token using the reusable service
    const clientTokenResult = await getFinverseClientToken(encryptionKey);
    
    if (!clientTokenResult.success || !clientTokenResult.accessToken) {
      return {
        success: false,
        error: `Failed to get client credentials token: ${clientTokenResult.error}`
      };
    }

    console.log('✅ Client credentials token obtained via service');

    // Generate a stable user_id from the encryption key (hash it for privacy)
    const userId = createHash("sha256").update(encryptionKey).digest("hex").substring(0, 32);

    // Use the client token to refresh the user's access token
    const response = await fetch('https://api.prod.finverse.net/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${clientTokenResult.accessToken}`,
      },
      body: new URLSearchParams({
        client_id: process.env.FINVERSE_CLIENT_ID!,
        client_secret: process.env.FINVERSE_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        user_id: userId,
      }),
    });

    console.log(`Finverse token refresh response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Invalid response format' }));
      console.error('Failed to refresh token:', errorData);
      
      // Handle different error response formats
      let errorMessage = 'Unknown error';
      if (typeof errorData === 'string') {
        errorMessage = errorData;
      } else if (errorData.error) {
        if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (typeof errorData.error === 'object') {
          errorMessage = JSON.stringify(errorData.error);
        }
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error_description) {
        errorMessage = errorData.error_description;
      }
      
      return {
        success: false,
        error: `Token refresh failed (${response.status}): ${errorMessage}`
      };
    }

    const tokenData = await response.json();
    console.log('Token response data:', { 
      hasAccessToken: !!tokenData.access_token, 
      hasRefreshToken: !!tokenData.refresh_token,
      tokenType: tokenData.token_type 
    });
    
    const newAccessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token || refreshToken; // Use new refresh token if provided, otherwise keep the old one

    if (!newAccessToken) {
      console.error('No access token in response:', tokenData);
      return {
        success: false,
        error: 'No access token received from refresh. Response: ' + JSON.stringify(tokenData)
      };
    }

    // Update stored tokens for the specific login identity
    const now = new Date();
    db.update(schema.openBankingTokens)
      .set({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        updatedAt: now
      })
      .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
      .run();

    console.log(`✅ Successfully refreshed access token for login identity ${loginIdentityId}`);

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };

  } catch (error) {
    console.error('Error refreshing token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during token refresh'
    };
  }
};

/**
 * Makes an authenticated request to Finverse API with automatic token refresh on 401
 */
export const makeAuthenticatedFinverseRequest = async (
  encryptionKey: string,
  loginIdentityId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const db = getDb(encryptionKey);
  
  // Get current access token for the specific login identity
  const tokenRecord = db.select()
    .from(schema.openBankingTokens)
    .where(eq(schema.openBankingTokens.loginIdentityId, loginIdentityId))
    .get();

  if (!tokenRecord) {
    throw new Error(`No access token found for login identity ${loginIdentityId}. User needs to reconnect their bank account.`);
  }

  const accessToken = tokenRecord.accessToken;

  // First attempt with current token
  const requestOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
    },
  };

  let response = await fetch(url, requestOptions);

  // If unauthorized, try to refresh token and retry once
  if (response.status === 401) {
    console.log(`🔄 Access token expired for login identity ${loginIdentityId}, attempting refresh...`);
    
    const refreshResult = await refreshFinverseToken(encryptionKey, loginIdentityId);
    console.log('Refresh result:', refreshResult);
    
    if (!refreshResult.success) {
      const errorMessage = typeof refreshResult.error === 'string' 
        ? refreshResult.error 
        : JSON.stringify(refreshResult.error || 'Unknown refresh error');
      
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }

    // Retry request with new token
    requestOptions.headers = {
      ...options.headers,
      'Authorization': `Bearer ${refreshResult.accessToken}`,
    };

    response = await fetch(url, requestOptions);
    
    if (response.status === 401) {
      throw new Error('Authentication failed even after token refresh. User needs to reconnect their bank account.');
    }
  }

  return response;
};
