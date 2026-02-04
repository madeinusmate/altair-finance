import type { 
  FinverseAccount, 
  FinverseTransaction, 
  FinverseAccountType,
  FinverseBalance
} from './finverse-types';

// Mapping utilities for Finverse Open Banking API responses

/**
 * Maps Finverse account type to our internal account type, nature, and category
 */
export const mapFinverseAccountType = (
  finverseType: FinverseAccountType
): { 
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
} => {
  const type = finverseType.type?.toLowerCase() || '';
  const subType = finverseType.sub_type?.toLowerCase() || '';

  // Default to transaction account, asset, checking
  let accountType: "balance" | "transaction" | "investment" = "transaction";
  let nature: "asset" | "liability" = "asset";
  let category = "checking";

  // Map based on account sub-type
  if (subType.includes('current') || subType.includes('checking')) {
    category = "checking";
    accountType = "transaction";
    nature = "asset";
  } else if (subType.includes('savings')) {
    category = "savings";
    accountType = "transaction";
    nature = "asset";
  } else if (subType.includes('investment')) {
    category = "investment";
    accountType = "investment";
    nature = "asset";
  } else if (subType.includes('credit') || subType.includes('card')) {
    category = "credit_card";
    accountType = "transaction";
    nature = "liability";
  } else if (subType.includes('loan')) {
    if (subType.includes('auto')) {
      category = "auto_loan";
    } else if (subType.includes('student')) {
      category = "student_loan";
    } else if (subType.includes('personal')) {
      category = "personal_loan";
    } else {
      category = "personal_loan";
    }
    accountType = "transaction";
    nature = "liability";
  } else if (subType.includes('mortgage')) {
    category = "mortgage";
    accountType = "transaction";
    nature = "liability";
  } else if (subType.includes('line') || subType.includes('credit')) {
    category = "line_of_credit";
    accountType = "transaction";
    nature = "liability";
  } else if (type.includes('business')) {
    category = "checking"; // Business checking
    accountType = "transaction";
    nature = "asset";
  }

  return { type: accountType, nature, category };
};

/**
 * Validates and normalizes currency code
 */
export const validateCurrency = (currency: string): string => {
  // Normalize to uppercase, support any 3-letter currency code
  return currency.toUpperCase().trim();
};

/**
 * Gets the primary balance from Finverse balance array
 */
export const getPrimaryBalance = (balances?: FinverseBalance[]): number => {
  if (!balances || balances.length === 0) return 0;
  
  // Prefer 'Expected' or 'Available' balance types, fall back to first available
  const preferredBalance = balances.find(b => 
    b.balance_type === 'Expected' || b.balance_type === 'Available'
  ) || balances[0];

  return preferredBalance.value || 0;
};

/**
 * Creates account data from Finverse data with user-selected categories
 */
export const createAccountFromFinverseData = (
  finverseAccount: FinverseAccount,
  userSelection: {
    type: "balance" | "transaction" | "investment";
    nature: "asset" | "liability";
    category: string;
    name?: string; // Allow user to customize name
  },
  loginIdentityId?: string
): {
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  initialBalance: number;
  metadata: string; // JSON string
} => {
  const currency = validateCurrency(finverseAccount.account_currency);
  
  // Starting balance is always 0 when importing all transactions
  const initialBalance = userSelection.type === "transaction" ? 0 : 0;

  const metadata = JSON.stringify({
    finverse: {
      account_id: finverseAccount.account_id,
      account_number_masked: finverseAccount.account_number_masked,
      account_type: finverseAccount.account_type,
      account_schemes: finverseAccount.account_schemes,
      status: finverseAccount.status,
      ...(loginIdentityId && { login_identity_id: loginIdentityId }),
      sync_enabled: true,
      last_synced: new Date().toISOString(),
      current_balance: getPrimaryBalance(finverseAccount.balances) || finverseAccount.balance?.value || 0,
      sync_status: 'pending' as const,
      sync_progress: {
        current_page: 0,
        processed_transactions: 0,
        last_updated: new Date().toISOString()
      }
    }
  });

  return {
    name: userSelection.name || finverseAccount.account_name || `Account ${finverseAccount.account_number_masked}`,
    type: userSelection.type,
    nature: userSelection.nature,
    category: userSelection.category,
    currency,
    initialBalance,
    metadata
  };
};

/**
 * Maps Finverse transaction amount to our internal transaction type (debit/credit)
 * For assets: negative amounts are debits, positive are credits
 * For liabilities: negative amounts are credits (payments), positive are debits (charges)
 */
export const mapFinverseTransactionType = (
  finverseTransaction: FinverseTransaction,
  accountNature: "asset" | "liability"
): "debit" | "credit" => {
  const transactionValue = finverseTransaction.amount?.value || 0;

  if (accountNature === "asset") {
    // For assets: negative = debit (money out), positive = credit (money in)
    return transactionValue < 0 ? "debit" : "credit";
  } else {
    // For liabilities: negative = credit (payment reduces liability), positive = debit (charge increases liability)
    return transactionValue < 0 ? "credit" : "debit";
  }
};

/**
 * Maps transaction category from Finverse to our internal categories
 * Leave uncategorized initially - user assigns categories later
 */
export const mapFinverseTransactionCategory = (
  finverseTransaction: FinverseTransaction
): string => {
  // Leave uncategorized - user assigns categories later
  // Store Finverse category in metadata for reference
  return "";
};

/**
 * Helper: Gets the best available date from Finverse transaction
 * Priority: transaction_date > posted_date
 */
const getBestTransactionDate = (finverseTransaction: FinverseTransaction): string | null => {
  // Use transaction_date as primary (when transaction occurred)
  if (finverseTransaction.transaction_date) {
    return finverseTransaction.transaction_date;
  }
  
  // Fallback to posted_date
  if (finverseTransaction.posted_date) {
    return finverseTransaction.posted_date;
  }
  
  return null;
};

/**
 * Maps a Finverse transaction to our internal transaction format
 */
export const mapFinverseTransactionToInternal = (
  finverseTransaction: FinverseTransaction,
  internalAccountId: string,
  finverseAccountId: string,
  accountNature: "asset" | "liability",
  loginIdentityId: string,
  syncBatch?: string
): {
  accountId: string;
  type: "debit" | "credit";
  category: string;
  amount: number;
  description: string | null;
  date: Date;
  metadata: string; // JSON string
} => {
  const type = mapFinverseTransactionType(finverseTransaction, accountNature);
  const category = mapFinverseTransactionCategory(finverseTransaction);
  
  // Get the best available transaction date
  const transactionDate = getBestTransactionDate(finverseTransaction);
  
  // Enhanced debug logging for missing dates
  if (!transactionDate) {
    console.warn(`⚠️ Transaction ${finverseTransaction.transaction_id} has no date fields:`, {
      posted_date: finverseTransaction.posted_date,
      transaction_date: finverseTransaction.transaction_date,
      transaction_id: finverseTransaction.transaction_id,
      description: finverseTransaction.description
    });
  }
  
  // Ensure we have a valid date, fallback to current date if needed
  let date: Date;
  if (transactionDate) {
    const parsedDate = new Date(transactionDate);
    if (isNaN(parsedDate.getTime())) {
      console.warn(`⚠️ Invalid date for transaction ${finverseTransaction.transaction_id}: ${transactionDate}, using current date`);
      date = new Date();
    } else {
      date = parsedDate;
    }
  } else {
    date = new Date();
  }

  const metadata = JSON.stringify({
    finverse: {
      transaction_id: finverseTransaction.transaction_id || `missing_${Date.now()}`,
      account_id: finverseAccountId,
      login_identity_id: loginIdentityId,
      ...(syncBatch && { sync_batch: syncBatch }),
      original_amount: {
        value: finverseTransaction.amount?.value || 0,
        currency: finverseTransaction.amount?.currency || 'USD',
        raw: finverseTransaction.amount?.raw || '0'
      },
      ...(finverseTransaction.transaction_date && {
        transaction_date: finverseTransaction.transaction_date
      }),
      ...(finverseTransaction.posted_date && {
        posted_date: finverseTransaction.posted_date
      }),
    }
  });

  return {
    accountId: internalAccountId,
    type,
    category,
    amount: Math.abs(finverseTransaction.amount?.value || 0), // Always positive, type determines impact
    description: finverseTransaction.description || null,
    date,
    metadata
  };
};

/**
 * Validates if a transaction should be imported (deduplication)
 */
export const shouldImportTransaction = (
  finverseTransaction: FinverseTransaction,
  existingFinverseTransactionIds: string[]
): boolean => {
  // Simple and reliable: check if transaction_id already exists
  return !existingFinverseTransactionIds.includes(finverseTransaction.transaction_id);
};
