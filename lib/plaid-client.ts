// Plaid API Client
// Uses raw fetch to avoid the heavy plaid Node SDK dependency

import type {
  PlaidEnvironment,
  PlaidLinkTokenResponse,
  PlaidPublicTokenExchangeResponse,
  PlaidAccountsResponse,
  PlaidTransactionsGetResponse,
  PlaidTransactionsSyncResponse,
  PlaidInstitutionResponse,
  PlaidItemRemoveResponse,
  PlaidErrorResponse,
} from "./plaid-types";

const PLAID_BASE_URLS: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const getPlaidEnv = (): PlaidEnvironment => {
  const env = process.env.PLAID_ENV as PlaidEnvironment | undefined;
  if (env && env in PLAID_BASE_URLS) return env;
  return "sandbox";
};

const getBaseUrl = (): string => {
  return PLAID_BASE_URLS[getPlaidEnv()];
};

const getCredentials = (): { clientId: string; secret: string } => {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET environment variables");
  }

  return { clientId, secret };
};

const plaidFetch = async <T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> => {
  const { clientId, secret } = getCredentials();
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      secret,
      ...body,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({
      error_type: "API_ERROR",
      error_code: "INTERNAL_SERVER_ERROR",
      error_message: `HTTP ${response.status}`,
      display_message: null,
      request_id: "",
    }))) as PlaidErrorResponse;

    throw new PlaidApiError(errorData);
  }

  return response.json() as Promise<T>;
};

export class PlaidApiError extends Error {
  errorType: string;
  errorCode: string;
  displayMessage: string | null;
  requestId: string;

  constructor(error: PlaidErrorResponse) {
    super(error.error_message);
    this.name = "PlaidApiError";
    this.errorType = error.error_type;
    this.errorCode = error.error_code;
    this.displayMessage = error.display_message;
    this.requestId = error.request_id;
  }
}

/**
 * Create a link token for Plaid Link initialization.
 */
export const createPlaidLinkToken = async (
  clientUserId: string
): Promise<PlaidLinkTokenResponse> => {
  return plaidFetch<PlaidLinkTokenResponse>("/link/token/create", {
    client_name: "Netly",
    user: {
      client_user_id: clientUserId,
    },
    products: ["transactions"],
    country_codes: ["GB",
      //  "CA", "GB", "IE", "FR", "ES", "NL", "DE"
      ],
    language: "en",
  });
};

/**
 * Exchange a public token from Plaid Link for an access token.
 */
export const exchangePlaidPublicToken = async (
  publicToken: string
): Promise<PlaidPublicTokenExchangeResponse> => {
  return plaidFetch<PlaidPublicTokenExchangeResponse>("/item/public_token/exchange", {
    public_token: publicToken,
  });
};

/**
 * Fetch accounts for an item using its access token.
 */
export const getPlaidAccounts = async (
  accessToken: string
): Promise<PlaidAccountsResponse> => {
  return plaidFetch<PlaidAccountsResponse>("/accounts/get", {
    access_token: accessToken,
  });
};

/**
 * Fetch institution details by institution ID.
 */
export const getPlaidInstitution = async (
  institutionId: string
): Promise<PlaidInstitutionResponse> => {
  return plaidFetch<PlaidInstitutionResponse>("/institutions/get_by_id", {
    institution_id: institutionId,
    country_codes: ["GB"],
    // "CA", "GB", "IE", "FR", "ES", "NL", "DE"
  });
};

/**
 * Fetch transactions using /transactions/get endpoint.
 */
export const getPlaidTransactions = async (
  accessToken: string,
  startDate: string,
  endDate: string,
  options?: {
    account_ids?: string[];
    count?: number;
    offset?: number;
  }
): Promise<PlaidTransactionsGetResponse> => {
  return plaidFetch<PlaidTransactionsGetResponse>("/transactions/get", {
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: {
      ...options,
      count: Math.min(options?.count ?? 100, 500),
      offset: options?.offset ?? 0,
    },
  });
};

/**
 * Sync transactions using /transactions/sync endpoint (incremental).
 */
export const syncPlaidTransactions = async (
  accessToken: string,
  cursor?: string
): Promise<PlaidTransactionsSyncResponse> => {
  return plaidFetch<PlaidTransactionsSyncResponse>("/transactions/sync", {
    access_token: accessToken,
    ...(cursor && { cursor }),
  });
};

/**
 * Remove a Plaid item (disconnect).
 */
export const removePlaidItem = async (
  accessToken: string
): Promise<PlaidItemRemoveResponse> => {
  return plaidFetch<PlaidItemRemoveResponse>("/item/remove", {
    access_token: accessToken,
  });
};
