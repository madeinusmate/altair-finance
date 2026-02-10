import type {
  PlaidAccount,
  PlaidAccountType,
  PlaidAccountSubtype,
  PlaidTransaction,
} from "./plaid-types";

// Mapping utilities for Plaid Open Banking API responses

/**
 * Maps Plaid account type/subtype to our internal account type, nature, and category
 */
export const mapPlaidAccountType = (
  type: PlaidAccountType,
  subtype: PlaidAccountSubtype | null
): {
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
} => {
  const sub = subtype?.toLowerCase() || "";

  switch (type) {
    case "depository": {
      if (sub.includes("savings") || sub === "cd" || sub === "money market") {
        return { type: "transaction", nature: "asset", category: "savings" };
      }
      if (sub === "hsa") {
        return { type: "transaction", nature: "asset", category: "savings" };
      }
      // checking, cash management, paypal, prepaid, ebt, or default
      return { type: "transaction", nature: "asset", category: "checking" };
    }

    case "credit": {
      return { type: "transaction", nature: "liability", category: "credit_card" };
    }

    case "loan": {
      if (sub === "mortgage" || sub === "home equity") {
        return { type: "transaction", nature: "liability", category: "mortgage" };
      }
      if (sub === "auto") {
        return { type: "transaction", nature: "liability", category: "auto_loan" };
      }
      if (sub === "student") {
        return { type: "transaction", nature: "liability", category: "student_loan" };
      }
      if (sub === "line of credit" || sub === "overdraft") {
        return { type: "transaction", nature: "liability", category: "line_of_credit" };
      }
      // business, commercial, construction, consumer, loan, or default
      return { type: "transaction", nature: "liability", category: "personal_loan" };
    }

    case "investment":
    case "brokerage": {
      return { type: "investment", nature: "asset", category: "investment" };
    }

    default: {
      return { type: "transaction", nature: "asset", category: "checking" };
    }
  }
};

/**
 * Gets the primary balance from Plaid account balances
 */
export const getPrimaryBalance = (account: PlaidAccount): number => {
  // Prefer current balance, fall back to available
  return account.balances.current ?? account.balances.available ?? 0;
};

/**
 * Creates account data from Plaid data with user-selected categories
 */
export const createAccountFromPlaidData = (
  plaidAccount: PlaidAccount,
  userSelection: {
    type: "balance" | "transaction" | "investment";
    nature: "asset" | "liability";
    category: string;
    name?: string;
  },
  itemId: string,
  institutionId?: string,
  institutionName?: string
): {
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  initialBalance: number;
  metadata: string;
} => {
  const currency = (
    plaidAccount.balances.iso_currency_code ||
    plaidAccount.balances.unofficial_currency_code ||
    "USD"
  ).toUpperCase();

  // Starting balance is always 0 when importing all transactions
  const initialBalance = 0;

  const metadata = JSON.stringify({
    provider: "plaid",
    plaid: {
      item_id: itemId,
      account_id: plaidAccount.account_id,
      mask: plaidAccount.mask,
      account_type: plaidAccount.type,
      account_subtype: plaidAccount.subtype,
      ...(institutionId && { institution_id: institutionId }),
      ...(institutionName && { institution_name: institutionName }),
      sync_enabled: true,
      last_synced: new Date().toISOString(),
      current_balance: getPrimaryBalance(plaidAccount),
      sync_status: "pending" as const,
      sync_progress: {
        current_page: 0,
        processed_transactions: 0,
        last_updated: new Date().toISOString(),
      },
    },
  });

  return {
    name: userSelection.name || plaidAccount.name || `Account ${plaidAccount.mask || "****"}`,
    type: userSelection.type,
    nature: userSelection.nature,
    category: userSelection.category,
    currency,
    initialBalance,
    metadata,
  };
};

/**
 * Maps Plaid transaction amount to our internal transaction type (debit/credit)
 * 
 * Plaid convention: positive amounts = money leaving account (debit),
 * negative amounts = money entering account (credit)
 * 
 * For assets: positive (Plaid) = debit (money out), negative (Plaid) = credit (money in)
 * For liabilities: positive (Plaid) = debit (charge), negative (Plaid) = credit (payment)
 */
export const mapPlaidTransactionType = (
  plaidTransaction: PlaidTransaction,
  accountNature: "asset" | "liability"
): "debit" | "credit" => {
  if (accountNature === "asset") {
    // Plaid: positive = money leaving (debit), negative = money entering (credit)
    return plaidTransaction.amount > 0 ? "debit" : "credit";
  } else {
    // For liabilities: positive = charge (debit), negative = payment (credit)
    return plaidTransaction.amount > 0 ? "debit" : "credit";
  }
};

/**
 * Maps a Plaid transaction to our internal transaction format
 */
export const mapPlaidTransactionToInternal = (
  plaidTransaction: PlaidTransaction,
  internalAccountId: string,
  plaidAccountId: string,
  accountNature: "asset" | "liability",
  itemId: string,
  syncBatch?: string
): {
  accountId: string;
  type: "debit" | "credit";
  category: string;
  amount: number;
  description: string | null;
  date: Date;
  metadata: string;
} => {
  const type = mapPlaidTransactionType(plaidTransaction, accountNature);

  // Get the best available transaction date
  const transactionDate = plaidTransaction.date || plaidTransaction.authorized_date;

  let date: Date;
  if (transactionDate) {
    const parsedDate = new Date(transactionDate);
    if (isNaN(parsedDate.getTime())) {
      console.warn(
        `Warning: Invalid date for transaction ${plaidTransaction.transaction_id}: ${transactionDate}, using current date`
      );
      date = new Date();
    } else {
      date = parsedDate;
    }
  } else {
    date = new Date();
  }

  const metadata = JSON.stringify({
    plaid: {
      transaction_id: plaidTransaction.transaction_id,
      account_id: plaidAccountId,
      item_id: itemId,
      ...(syncBatch && { sync_batch: syncBatch }),
      original_amount: plaidTransaction.amount,
      iso_currency_code: plaidTransaction.iso_currency_code,
      merchant_name: plaidTransaction.merchant_name,
      payment_channel: plaidTransaction.payment_channel,
      personal_finance_category: plaidTransaction.personal_finance_category,
      ...(plaidTransaction.date && { date: plaidTransaction.date }),
      ...(plaidTransaction.authorized_date && {
        authorized_date: plaidTransaction.authorized_date,
      }),
    },
  });

  // Use merchant name if available, otherwise use transaction name
  const description = plaidTransaction.merchant_name || plaidTransaction.name || null;

  return {
    accountId: internalAccountId,
    type,
    category: "", // Leave uncategorized - user assigns categories later
    amount: Math.abs(plaidTransaction.amount), // Always positive, type determines impact
    description,
    date,
    metadata,
  };
};

/**
 * Validates if a transaction should be imported (deduplication)
 */
export const shouldImportTransaction = (
  plaidTransaction: PlaidTransaction,
  existingPlaidTransactionIds: string[]
): boolean => {
  return !existingPlaidTransactionIds.includes(plaidTransaction.transaction_id);
};
