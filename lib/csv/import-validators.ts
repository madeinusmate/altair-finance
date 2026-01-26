import { CATEGORIES, Category } from "@/lib/categories";
import { Account } from "@/lib/db/schema";
import { ACCOUNT_CATEGORIES, isValidAccountCategory } from "@/lib/account-categories";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/currencies";

type CsvRow = Record<string, string | undefined>;

export type CsvRowIssue = {
  rowNumber: number;
  field?: string;
  message: string;
};

export type ParsedTransactionRow = {
  id: string;
  rowNumber: number;
  date: string;
  account: string;
  description: string;
  amount: string;
  category: string;
  type: string;
  transferAccount: string;
  errors: string[];
  warnings: string[];
};

export type ParsedBalanceRow = {
  id: string;
  rowNumber: number;
  date: string;
  account: string;
  balance: string;
  errors: string[];
  warnings: string[];
};

export type ParsedAccountRow = {
  id: string;
  rowNumber: number;
  name: string;
  type: string;
  nature: string;
  category: string;
  currency: string;
  initialBalance: string;
  errors: string[];
  warnings: string[];
};

const TRANSACTION_HEADERS = ["date", "account", "description", "amount", "category", "type", "transfer_account"];
const BALANCE_HEADERS = ["date", "account", "balance"];
const ACCOUNT_HEADERS = ["name", "type", "nature", "category", "currency", "initial_balance"];

const normalizeAccountName = (name: string) => name.trim().toLowerCase();

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const parsePositiveNumber = (value: string) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }
  return numberValue;
};

const parseNumber = (value: string) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return null;
  }
  return numberValue;
};

export const getMissingHeaders = (headers: string[], requiredHeaders: string[]) =>
  requiredHeaders.filter((header) => !headers.includes(header));

export const buildAccountNameMap = (accounts: Account[]) => {
  const map = new Map<string, Account>();
  accounts.forEach((account) => {
    map.set(normalizeAccountName(account.name), account);
  });
  return map;
};

export const validateTransactionRows = (rows: CsvRow[], accounts: Account[]) => {
  const accountMap = buildAccountNameMap(accounts);
  const parsedRows: ParsedTransactionRow[] = rows.map((row, index) => {
    const rowNumber = index + 2; // 1-based row + header
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = (row.date || "").trim();
    const account = (row.account || "").trim();
    const description = (row.description || "").trim();
    const amount = (row.amount || "").trim();
    const category = (row.category || "").trim();
    const type = (row.type || "").trim().toLowerCase();
    const transferAccount = (row.transfer_account || "").trim();

    if (!date || !isIsoDate(date)) {
      errors.push("Invalid or missing date (YYYY-MM-DD)");
    }

    if (!account) {
      errors.push("Missing account");
    }

    const accountRecord = account ? accountMap.get(normalizeAccountName(account)) : null;
    if (account && !accountRecord) {
      errors.push(`Account not found: ${account}`);
    }

    if (!amount || parsePositiveNumber(amount) === null) {
      errors.push("Amount must be a positive number");
    }

    if (!type || !["debit", "credit", "transfer"].includes(type)) {
      errors.push("Type must be debit, credit, or transfer");
    }

    const shouldValidateCategory = type !== "transfer";
    const normalizedCategory =
      shouldValidateCategory && category && CATEGORIES.includes(category as Category)
        ? category
        : "Other";
    if (shouldValidateCategory && (!category || !CATEGORIES.includes(category as Category))) {
      warnings.push("Category defaulted to Other");
    }

    if (type === "transfer") {
      if (!transferAccount) {
        errors.push("Transfer account is required for transfer rows");
      }
      if (transferAccount && transferAccount === account) {
        errors.push("Transfer account must be different from account");
      }
      const transferRecord = transferAccount
        ? accountMap.get(normalizeAccountName(transferAccount))
        : null;
      if (transferAccount && !transferRecord) {
        errors.push(`Transfer account not found: ${transferAccount}`);
      }
      if (accountRecord?.type === "balance") {
        errors.push("Transfers cannot use balance accounts");
      }
    }

    return {
      id: `${index}`,
      rowNumber,
      date,
      account,
      description,
      amount,
      category: normalizedCategory,
      type,
      transferAccount,
      errors,
      warnings,
    };
  });

  return parsedRows;
};

export const validateBalanceRows = (rows: CsvRow[], accounts: Account[]) => {
  const accountMap = buildAccountNameMap(accounts);
  const parsedRows: ParsedBalanceRow[] = rows.map((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const date = (row.date || "").trim();
    const account = (row.account || "").trim();
    const balance = (row.balance || "").trim();

    if (!date || !isIsoDate(date)) {
      errors.push("Invalid or missing date (YYYY-MM-DD)");
    }

    if (!account) {
      errors.push("Missing account");
    }

    const accountRecord = account ? accountMap.get(normalizeAccountName(account)) : null;
    if (account && !accountRecord) {
      errors.push(`Account not found: ${account}`);
    }

    if (accountRecord && !["balance", "investment"].includes(accountRecord.type)) {
      errors.push("Balance updates only apply to balance or investment accounts");
    }

    if (!balance || parsePositiveNumber(balance) === null) {
      errors.push("Balance must be a positive number");
    }

    return {
      id: `${index}`,
      rowNumber,
      date,
      account,
      balance,
      errors,
      warnings,
    };
  });

  return parsedRows;
};

export const validateAccountRows = (rows: CsvRow[], existingAccounts: Account[]) => {
  const accountNameMap = buildAccountNameMap(existingAccounts);
  const nameSet = new Set<string>();
  
  const parsedRows: ParsedAccountRow[] = rows.map((row, index) => {
    const rowNumber = index + 2; // 1-based row + header
    const errors: string[] = [];
    const warnings: string[] = [];
    const name = (row.name || "").trim();
    const type = (row.type || "").trim().toLowerCase();
    const nature = (row.nature || "").trim().toLowerCase();
    const category = (row.category || "").trim();
    const currency = (row.currency || "").trim().toUpperCase();
    const initialBalance = (row.initial_balance || "").trim();

    // Validate name
    if (!name) {
      errors.push("Missing account name");
    } else {
      const normalizedName = normalizeAccountName(name);
      // Check for duplicates within CSV
      if (nameSet.has(normalizedName)) {
        errors.push(`Duplicate account name in CSV: ${name}`);
      } else {
        nameSet.add(normalizedName);
      }
      // Check for duplicates against existing accounts
      if (accountNameMap.has(normalizedName)) {
        errors.push(`Account already exists: ${name}`);
      }
    }

    // Validate type
    if (!type || !["balance", "transaction", "investment"].includes(type)) {
      errors.push("Type must be balance, transaction, or investment");
    }

    // Validate nature
    if (!nature || !["asset", "liability"].includes(nature)) {
      errors.push("Nature must be asset or liability");
    }

    // Validate type-nature combination (investment must be asset)
    if (type === "investment" && nature !== "asset") {
      errors.push("Investment accounts must have nature 'asset'");
    }

    // Validate category
    if (!category) {
      errors.push("Missing category");
    } else if (!isValidAccountCategory(category)) {
      errors.push(`Invalid category. Must be one of: ${ACCOUNT_CATEGORIES.join(", ")}`);
    }

    // Validate currency
    if (!currency) {
      errors.push("Missing currency");
    } else if (!isSupportedCurrency(currency)) {
      errors.push(`Invalid currency. Must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`);
    }

    // Validate initial balance
    if (initialBalance === "") {
      errors.push("Missing initial balance");
    } else {
      const balanceValue = parseNumber(initialBalance);
      if (balanceValue === null) {
        errors.push("Initial balance must be a valid number");
      } else {
        // Investment accounts must have 0 initial balance
        if (type === "investment" && balanceValue !== 0) {
          errors.push("Investment accounts must have initial balance of 0");
        }
      }
    }

    return {
      id: `${index}`,
      rowNumber,
      name,
      type,
      nature,
      category,
      currency,
      initialBalance,
      errors,
      warnings,
    };
  });

  return parsedRows;
};

export const getRequiredHeaders = (type: "transactions" | "balances" | "accounts") => {
  if (type === "transactions") return TRANSACTION_HEADERS;
  if (type === "balances") return BALANCE_HEADERS;
  return ACCOUNT_HEADERS;
};
