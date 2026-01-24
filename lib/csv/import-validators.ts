import { CATEGORIES, Category } from "@/lib/categories";
import { Account } from "@/lib/db/schema";

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

const TRANSACTION_HEADERS = ["date", "account", "description", "amount", "category", "type", "transfer_account"];
const BALANCE_HEADERS = ["date", "account", "balance"];

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

export const getRequiredHeaders = (type: "transactions" | "balances") =>
  type === "transactions" ? TRANSACTION_HEADERS : BALANCE_HEADERS;
