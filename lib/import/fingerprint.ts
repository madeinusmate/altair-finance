// SHA-256 of ledger identity fields. Web Crypto in the browser and on the server
// (Node's global crypto.subtle). Backfill uses the same payload strings with node:crypto.
//
// A row is a duplicate only when the calendar date is the same day and every other
// imported field is exactly the same. There is no date window and no fuzzy match.
// Money compares in cents so 10 and 10.004 are the same amount. Text is exact:
// case and internal spaces stay. Null and "" are the same empty field.

export const amountToCents = (amount: number | string | null | undefined): number | null => {
  if (amount == null || amount === "") {
    return null;
  }
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100);
};

export const exactText = (value: string | null | undefined): string => (value == null ? "" : String(value));

// YYYY-MM-DD strings are kept as written. Stored unix seconds and UTC-midnight Dates
// format in UTC. Do not format a local-midnight Date with the local timezone.
// A date one day away is a different key. There is no tolerance window.
export const utcDateKey = (value: Date | number | string | null | undefined): string | null => {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
    const parsed = new Date(milliseconds);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().slice(0, 10);
  }
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  return value.toISOString().slice(0, 10);
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const centsOrNull = (amount: number | string | null | undefined): number | null => {
  if (amount == null || amount === "") {
    return null;
  }
  return amountToCents(amount);
};

// Fixed order so a "|" inside a description cannot slide into the next field.
const identityPayload = (parts: unknown[]): string => JSON.stringify(parts);

export type TransactionFingerprintInput = {
  accountId: string;
  date: Date | number | string | null | undefined;
  amount: number | string | null | undefined;
  description?: string | null;
  payee?: string | null;
  category?: string | null;
  type: string;
  fromAmount?: number | string | null;
  toAmount?: number | string | null;
  transferAccountId?: string | null;
};

export const transactionFingerprintPayload = (input: TransactionFingerprintInput): string | null => {
  const date = utcDateKey(input.date);
  const cents = amountToCents(input.amount);
  if (!input.accountId || !date || cents === null) {
    return null;
  }
  if (input.type !== "debit" && input.type !== "credit") {
    return null;
  }
  return identityPayload([
    "tx",
    input.accountId,
    exactText(input.transferAccountId),
    date,
    exactText(input.description),
    exactText(input.payee),
    cents,
    centsOrNull(input.fromAmount),
    centsOrNull(input.toAmount),
    exactText(input.category),
    input.type,
  ]);
};

export const transactionFingerprint = async (
  input: TransactionFingerprintInput
): Promise<string | null> => {
  const payload = transactionFingerprintPayload(input);
  if (!payload) {
    return null;
  }
  return sha256Hex(payload);
};

export type TransferFingerprintInput = {
  fromAccountId: string;
  toAccountId: string;
  date: Date | number | string | null | undefined;
  fromAmount: number | string | null | undefined;
  toAmount: number | string | null | undefined;
  amount?: number | string | null | undefined;
  description?: string | null;
  payee?: string | null;
  category?: string | null;
};

export const transferFingerprintPayload = (input: TransferFingerprintInput): string | null => {
  const date = utcDateKey(input.date);
  const fromCents = amountToCents(input.fromAmount);
  const toCents = amountToCents(input.toAmount);
  if (!input.fromAccountId || !input.toAccountId || !date || fromCents === null || toCents === null) {
    return null;
  }
  const amountCents = input.amount == null || input.amount === "" ? fromCents : amountToCents(input.amount);
  if (amountCents === null) {
    return null;
  }
  return identityPayload([
    "xfer",
    input.fromAccountId,
    input.toAccountId,
    date,
    exactText(input.description),
    exactText(input.payee),
    amountCents,
    fromCents,
    toCents,
    exactText(input.category),
    "transfer",
  ]);
};

export const transferFingerprint = async (input: TransferFingerprintInput): Promise<string | null> => {
  const payload = transferFingerprintPayload(input);
  if (!payload) {
    return null;
  }
  return sha256Hex(payload);
};

export type BalanceFingerprintInput = {
  accountId: string;
  date: Date | number | string | null | undefined;
  balance: number | string | null | undefined;
};

export const balanceFingerprintPayload = (input: BalanceFingerprintInput): string | null => {
  const date = utcDateKey(input.date);
  const cents = amountToCents(input.balance);
  if (!input.accountId || !date || cents === null) {
    return null;
  }
  return identityPayload(["bal", input.accountId, date, cents]);
};

export const balanceFingerprint = async (input: BalanceFingerprintInput): Promise<string | null> => {
  const payload = balanceFingerprintPayload(input);
  if (!payload) {
    return null;
  }
  return sha256Hex(payload);
};
