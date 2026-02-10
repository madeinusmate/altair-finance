// Plaid Open Banking API Types
// Based on Plaid API documentation: https://plaid.com/docs/api/

export type PlaidEnvironment = "sandbox" | "development" | "production";

export interface PlaidAmount {
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

export interface PlaidAccountBalance {
  available: number | null;
  current: number | null;
  limit: number | null;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
}

export type PlaidAccountType = "depository" | "credit" | "loan" | "investment" | "brokerage" | "other";

export type PlaidAccountSubtype =
  | "checking"
  | "savings"
  | "hsa"
  | "cd"
  | "money market"
  | "paypal"
  | "prepaid"
  | "cash management"
  | "ebt"
  | "credit card"
  | "auto"
  | "business"
  | "commercial"
  | "construction"
  | "consumer"
  | "home equity"
  | "loan"
  | "mortgage"
  | "overdraft"
  | "line of credit"
  | "student"
  | "401a"
  | "401k"
  | "403B"
  | "457b"
  | "529"
  | "brokerage"
  | "cash isa"
  | "crypto exchange"
  | "education savings account"
  | "fixed annuity"
  | "gic"
  | "health reimbursement arrangement"
  | "ira"
  | "isa"
  | "keogh"
  | "lif"
  | "life insurance"
  | "lira"
  | "lrif"
  | "lrsp"
  | "mutual fund"
  | "non-custodial wallet"
  | "non-taxable brokerage account"
  | "other"
  | "other insurance"
  | "other annuity"
  | "pension"
  | "prif"
  | "profit sharing plan"
  | "qshr"
  | "rdsp"
  | "resp"
  | "retirement"
  | "rlif"
  | "roth"
  | "roth 401k"
  | "rrif"
  | "rrsp"
  | "sarsep"
  | "sep ira"
  | "simple ira"
  | "sipp"
  | "stock plan"
  | "tfsa"
  | "trust"
  | "ugma"
  | "utma"
  | "variable annuity"
  | string;

export interface PlaidAccount {
  account_id: string;
  balances: PlaidAccountBalance;
  mask: string | null;
  name: string;
  official_name: string | null;
  type: PlaidAccountType;
  subtype: PlaidAccountSubtype | null;
  persistent_account_id?: string;
  // Enhanced fields added during processing
  item_id?: string;
  institution_id?: string;
  institution_name?: string;
  connection_metadata?: {
    plaid: {
      item_id: string;
      account_id: string;
      institution_id?: string;
      institution_name?: string;
      connection_status: string;
      connected_at: string;
    };
  };
}

export interface PlaidPersonalFinanceCategory {
  primary: string;
  detailed: string;
  confidence_level?: string;
}

export interface PlaidTransaction {
  account_id: string;
  transaction_id: string;
  amount: number; // Positive for debits, negative for credits (Plaid convention)
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  date: string; // YYYY-MM-DD
  datetime: string | null;
  authorized_date: string | null;
  authorized_datetime: string | null;
  name: string;
  merchant_name: string | null;
  payment_channel: "online" | "in store" | "other";
  pending: boolean;
  pending_transaction_id: string | null;
  personal_finance_category: PlaidPersonalFinanceCategory | null;
  category: string[] | null;
  category_id: string | null;
  transaction_type: string;
  logo_url: string | null;
  website: string | null;
}

// API Request types

export interface PlaidLinkTokenCreateRequest {
  client_id: string;
  secret: string;
  client_name: string;
  user: {
    client_user_id: string;
  };
  products: string[];
  country_codes: string[];
  language: string;
  redirect_uri?: string;
}

// API Response types

export interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

export interface PlaidPublicTokenExchangeResponse {
  access_token: string;
  item_id: string;
  request_id: string;
}

export interface PlaidAccountsResponse {
  accounts: PlaidAccount[];
  item: {
    item_id: string;
    institution_id: string | null;
    available_products: string[];
    billed_products: string[];
    consent_expiration_time: string | null;
  };
  request_id: string;
}

export interface PlaidInstitutionResponse {
  institution: {
    institution_id: string;
    name: string;
    country_codes: string[];
    products: string[];
  };
  request_id: string;
}

export interface PlaidTransactionsGetResponse {
  accounts: PlaidAccount[];
  transactions: PlaidTransaction[];
  total_transactions: number;
  request_id: string;
}

export interface PlaidTransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
  request_id: string;
}

export interface PlaidItemRemoveResponse {
  request_id: string;
}

export interface PlaidErrorResponse {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
  request_id: string;
}
