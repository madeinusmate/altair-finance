import { inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { addStoredFingerprints } from "./plan-import-rows";

type LedgerDb = ReturnType<typeof getDb>;

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids.filter((id) => Boolean(id))));

export const loadTransactionFingerprints = (db: LedgerDb, accountIds: string[]): Set<string> => {
  const fingerprints = new Set<string>();
  const ids = uniqueIds(accountIds);
  if (ids.length === 0) {
    return fingerprints;
  }
  const rows = db
    .select({
      fingerprint: schema.transactions.fingerprint,
      sourceFingerprint: schema.transactions.sourceFingerprint,
    })
    .from(schema.transactions)
    .where(inArray(schema.transactions.accountId, ids))
    .all();
  addStoredFingerprints(fingerprints, rows);
  return fingerprints;
};

export const loadTransferFingerprints = (db: LedgerDb, accountIds: string[]): Set<string> => {
  const fingerprints = new Set<string>();
  const ids = uniqueIds(accountIds);
  if (ids.length === 0) {
    return fingerprints;
  }
  const rows = db
    .select({
      fingerprint: schema.transfers.fingerprint,
      sourceFingerprint: schema.transfers.sourceFingerprint,
    })
    .from(schema.transfers)
    .where(
      or(inArray(schema.transfers.fromAccountId, ids), inArray(schema.transfers.toAccountId, ids))
    )
    .all();
  addStoredFingerprints(fingerprints, rows);
  return fingerprints;
};

export const loadBalanceFingerprints = (db: LedgerDb, accountIds: string[]): Set<string> => {
  const fingerprints = new Set<string>();
  const ids = uniqueIds(accountIds);
  if (ids.length === 0) {
    return fingerprints;
  }

  const balances = db
    .select({
      fingerprint: schema.balanceHistory.fingerprint,
      sourceFingerprint: schema.balanceHistory.sourceFingerprint,
    })
    .from(schema.balanceHistory)
    .where(inArray(schema.balanceHistory.accountId, ids))
    .all();
  const investments = db
    .select({
      fingerprint: schema.investmentHistory.fingerprint,
      sourceFingerprint: schema.investmentHistory.sourceFingerprint,
    })
    .from(schema.investmentHistory)
    .where(inArray(schema.investmentHistory.accountId, ids))
    .all();
  addStoredFingerprints(fingerprints, balances);
  addStoredFingerprints(fingerprints, investments);
  return fingerprints;
};
