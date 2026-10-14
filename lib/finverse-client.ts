import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export interface ClientCredentialsResult {
  success: boolean;
  accessToken?: string;
  expiresAt?: Date;
  error?: string;
}

interface StoredClientToken {
  accessToken: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Finverse Client Credentials Service
 * Manages client-level authentication tokens for Finverse API
 * Uses SQLite for token storage (encrypted via database encryption)
 */
class FinverseClientService {
  private static instance: FinverseClientService;
  private cachedToken: StoredClientToken | null = null;
  private tokenPromise: Promise<ClientCredentialsResult> | null = null;

  private constructor() {}

  static getInstance(): FinverseClientService {
    if (!FinverseClientService.instance) {
      FinverseClientService.instance = new FinverseClientService();
    }
    return FinverseClientService.instance;
  }

  /**
   * Get a valid client credentials token, using cache when possible
   */
  async getClientToken(encryptionKey: string): Promise<ClientCredentialsResult> {
    // If there's already a request in flight, wait for it
    if (this.tokenPromise) {
      console.log('🔄 Waiting for existing token request...');
      return this.tokenPromise;
    }

    // Check if we have a valid cached token
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      console.log('✅ Using cached client credentials token');
      return {
        success: true,
        accessToken: this.cachedToken.accessToken,
        expiresAt: this.cachedToken.expiresAt
      };
    }

    // Check SQLite for a valid stored token
    const storedToken = await this.getStoredToken(encryptionKey);
    if (storedToken && this.isTokenValid(storedToken)) {
      console.log('✅ Using stored client credentials token');
      this.cachedToken = storedToken;
      return {
        success: true,
        accessToken: storedToken.accessToken,
        expiresAt: storedToken.expiresAt
      };
    }

    // Need to fetch a new token
    console.log('🔑 Fetching new client credentials token...');
    this.tokenPromise = this.fetchNewClientToken(encryptionKey);
    
    try {
      const result = await this.tokenPromise;
      return result;
    } finally {
      this.tokenPromise = null;
    }
  }

  /**
   * Force refresh the client credentials token
   */
  async refreshClientToken(encryptionKey: string): Promise<ClientCredentialsResult> {
    console.log('🔄 Force refreshing client credentials token...');
    this.cachedToken = null;
    this.tokenPromise = null;
    
    // Clear stored token
    try {
      const db = getDb(encryptionKey);
      db.delete(schema.openBankingClientTokens)
        .where(eq(schema.openBankingClientTokens.id, 'client_credentials'))
        .run();
    } catch (error) {
      console.warn('Failed to clear stored token:', error);
    }

    return this.getClientToken(encryptionKey);
  }

  /**
   * Fetch a new client credentials token from Finverse API
   */
  private async fetchNewClientToken(encryptionKey: string): Promise<ClientCredentialsResult> {
    try {
      const clientId = process.env.FINVERSE_CLIENT_ID;
      const clientSecret = process.env.FINVERSE_SECRET;

      if (!clientId || !clientSecret) {
        return {
          success: false,
          error: 'Missing FINVERSE_CLIENT_ID or FINVERSE_SECRET environment variables'
        };
      }

      const response = await fetch('https://api.prod.finverse.net/auth/customer/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Invalid response format' }));
        console.error("Failed to get client credentials token:", response.status);
        
        let errorMessage = 'Unknown error';
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.error) {
          errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }

        return {
          success: false,
          error: `Failed to get client credentials token (${response.status}): ${errorMessage}`
        };
      }

      const tokenData = await response.json();
      const accessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour if not provided

      if (!accessToken) {
        return {
          success: false,
          error: 'No access token received from Finverse'
        };
      }

      // Calculate expiry time (subtract 5 minutes for safety margin)
      const expiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);
      
      const storedToken: StoredClientToken = {
        accessToken,
        expiresAt,
        createdAt: new Date()
      };

      // Store in cache and SQLite
      this.cachedToken = storedToken;
      await this.storeToken(encryptionKey, storedToken);

      console.log('✅ Successfully obtained client credentials token');

      return {
        success: true,
        accessToken,
        expiresAt
      };

    } catch (error) {
      console.error('Error fetching client credentials token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during token fetch'
      };
    }
  }

  /**
   * Check if a token is still valid (not expired)
   */
  private isTokenValid(token: StoredClientToken): boolean {
    const now = new Date();
    return token.expiresAt > now;
  }

  /**
   * Get stored token from SQLite
   */
  private async getStoredToken(encryptionKey: string): Promise<StoredClientToken | null> {
    try {
      const db = getDb(encryptionKey);
      const token = db.select()
        .from(schema.openBankingClientTokens)
        .where(eq(schema.openBankingClientTokens.id, 'client_credentials'))
        .get();
      
      if (token) {
        return {
          accessToken: token.accessToken,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt
        };
      }
      return null;
    } catch (error) {
      console.warn('Failed to get stored token:', error);
      return null;
    }
  }

  /**
   * Store token in SQLite
   */
  private async storeToken(encryptionKey: string, token: StoredClientToken): Promise<void> {
    try {
      const db = getDb(encryptionKey);
      
      // Upsert token
      const existing = db.select()
        .from(schema.openBankingClientTokens)
        .where(eq(schema.openBankingClientTokens.id, 'client_credentials'))
        .get();
      
      if (existing) {
        db.update(schema.openBankingClientTokens)
          .set({
            accessToken: token.accessToken,
            expiresAt: token.expiresAt,
            createdAt: token.createdAt
          })
          .where(eq(schema.openBankingClientTokens.id, 'client_credentials'))
          .run();
      } else {
        db.insert(schema.openBankingClientTokens)
          .values({
            id: 'client_credentials',
            accessToken: token.accessToken,
            expiresAt: token.expiresAt,
            createdAt: token.createdAt
          })
          .run();
      }
    } catch (error) {
      console.warn('Failed to store token:', error);
      // Don't throw - we can still use the cached token
    }
  }
}

// Export singleton instance
export const finverseClient = FinverseClientService.getInstance();

/**
 * Convenience function to get a client credentials token
 */
export const getFinverseClientToken = (encryptionKey: string) => finverseClient.getClientToken(encryptionKey);

/**
 * Convenience function to refresh the client credentials token
 */
export const refreshFinverseClientToken = (encryptionKey: string) => finverseClient.refreshClientToken(encryptionKey);
