// Finverse Open Banking API Types
// Based on Open Banking UK standards and Finverse API documentation

export interface FinverseAmount {
  currency: string;
  raw: string;
  value: number;
}

export interface FinverseAccountType {
  type: string;        // e.g., "Personal current account", "Business"  
  sub_type: string;    // e.g., "CurrentAccount", "Savings", "CreditCard"
}

export interface FinverseBalance {
  currency: string;
  value: number;
  raw: string;
  credit_limit_included?: boolean;
  credit_debit_indicator?: 'credit' | 'debit';
  balance_type?: 'Expected' | 'Available' | 'Current' | 'InterimAvailable' | 'ClosingBooked' | 'OpeningBooked';
}

export interface FinverseMerchant {
  name: string;
  category_code?: string;
}

export interface FinverseAccountScheme {
  identification: string;  // Account number, IBAN, etc.
  scheme_name: string;     // "IBAN", "SortCodeAccountNumber", "BICFI"
}

// Base Account from Finverse API
export interface FinverseAccount {
  account_id: string;
  account_name: string;
  account_number_masked: string;
  account_currency: string;
  account_type: FinverseAccountType;
  balance?: FinverseBalance;
  balances?: FinverseBalance[];  // Multiple balance types
  account_schemes?: FinverseAccountScheme[];
  nickname?: string;
  status?: 'Enabled' | 'Disabled' | 'Deleted' | 'Pending';
  // Additional fields based on Open Banking spec
  product_name?: string;
  opening_date?: string;
  maturity_date?: string;
  // Enhanced fields added by fetchAccounts endpoint
  login_identity_id?: string;
  connection_metadata?: {
    finverse: {
      login_identity_id: string;
      account_id: string;
      connection_status: string;
      connected_at: string;
    };
  };
}

// Base Transaction from Finverse API  
export interface FinverseTransaction {
  account_id: string; 
  amount: FinverseAmount;
  categories?: any;
  category_predictions?: any[];
  created_at: string;
  description: string;
  is_pending?: boolean;
  posted_date: string;
  transaction_date?: string;
  transaction_details?: any;  
  transaction_id: string;  
  transaction_reference?: string;
  transaction_type: string;
  updated_at: string;
}

// API Response wrappers
export interface FinverseAccountsResponse {
  accounts: FinverseAccount[];
  pagination?: {
    page: number;
    page_size: number;
    total_pages: number;
    total_count: number;
  };
}

export interface FinverseTransactionsResponse {
  transactions: FinverseTransaction[];
  account_id: string;
  total_transactions: number;      // Total number of transaction records available
  offset?: number;                 // Current offset
  limit?: number;                  // Current limit
  meta?: {
    first_available_date_time?: string;
    last_available_date_time?: string;
  };
}

// Error response type
export interface FinverseErrorResponse {
  error: string;
  code: string;
  details?: any;
  message?: string;
}

// Token response types
export interface FinverseTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  login_identity_id?: string;
}

export interface FinverseAuthCodeExchangeResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  login_identity_id: string;
}

export interface FinverseLinkTokenRequest {
  client_id: string;
  redirect_uri: string;
  state: string;
  user_id: string;
  grant_type: 'client_credentials';
  response_mode: 'form_post';
  response_type: 'code';
  automatic_data_refresh?: 'ON' | 'OFF';
  link_mode?: string;
  language: string;
  products_requested: string[];
  ui_mode: 'redirect' | 'popup';
  user_type?: string[];
}

export interface FinverseLinkTokenResponse {
  link_url: string;
  link_token?: string;
}

// Utility types for date filtering
export interface FinverseTransactionFilter {
  from_booking_date_time?: string;
  to_booking_date_time?: string;
  from_value_date_time?: string;
  to_value_date_time?: string;
}
