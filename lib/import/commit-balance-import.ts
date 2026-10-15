import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { balanceFingerprint } from "@/lib/import/fingerprint";
import { loadBalanceFingerprints } from "@/lib/import/load-fingerprints";
import { parseImportDuplicates, planImportRows, rowConfirmsDuplicate, type FlaggedDuplicate } from "@/lib/import/plan-import-rows";

type LedgerDb = ReturnType<typeof getDb>;

type ImportBalanceRow = {
  accountId: string;
  balance: number;
  date: string;
  overrideDuplicate?: boolean;
};

export type BalanceImportSuccess = {
  success: true;
  balances: number;
  investments: number;
  skippedDuplicates: number;
  skippedIndexes: number[];
  flaggedDuplicates: FlaggedDuplicate[];
  importId: string | null;
  isDuplicate: boolean;
};

const importRowError = (message: string): Error => {
  const error = new Error(message);
  error.name = "ImportRowError";
  return error;
};

const isImportRowError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "ImportRowError";

export const commitBalanceImport = async (
  db: LedgerDb,
  body: { rows?: ImportBalanceRow[]; filename?: string; fileHash?: string; importDuplicates?: unknown }
): Promise<{ status: number; payload: BalanceImportSuccess | { error: string } }> => {
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  const filename = body?.filename;
  const fileHash = body?.fileHash;

  if (!rows || rows.length === 0) {
    return { status: 400, payload: { error: "Rows are required" } };
  }

  let importDuplicates;
  try {
    importDuplicates = parseImportDuplicates(body?.importDuplicates, rows.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid importDuplicates";
    return { status: 400, payload: { error: message } };
  }

  try {
    const fingerprinted = await Promise.all(
      rows.map(async (row, index) => ({
        row,
        fingerprint: row
          ? await balanceFingerprint({
              accountId: row.accountId,
              date: row.date,
              balance: row.balance,
            })
          : null,
        overrideDuplicate: rowConfirmsDuplicate(index, row?.overrideDuplicate === true, importDuplicates),
      }))
    );

    const now = new Date();
    const result = db.transaction((tx) => {
      const txDb = tx as LedgerDb;
      const accounts = txDb.select().from(schema.accounts).all();
      const accountMap = new Map(accounts.map((account) => [account.id, account]));
      const existing = loadBalanceFingerprints(
        txDb,
        fingerprinted.flatMap((entry) => (entry.row?.accountId ? [entry.row.accountId] : []))
      );
      const { decisions, skippedDuplicates, flaggedDuplicates, skippedIndexes } = planImportRows(existing, fingerprinted);

      let balanceCount = 0;
      let investmentCount = 0;
      const pending: Array<{ kind: "balance" | "investment"; values: Record<string, unknown> }> = [];

      for (const decision of decisions) {
        if (!decision.insert) {
          continue;
        }
        const row = fingerprinted[decision.index].row;
        const index = decision.index;
        if (!row || !decision.fingerprint) {
          throw importRowError(`Row ${index + 1}: Balance must be a positive number`);
        }
        const balance = Number(row.balance);
        if (!Number.isFinite(balance) || balance <= 0) {
          throw importRowError(`Row ${index + 1}: Balance must be a positive number`);
        }
        if (!row.date) {
          throw importRowError(`Row ${index + 1}: Date is required`);
        }
        const parsedDate = new Date(row.date);
        if (Number.isNaN(parsedDate.getTime())) {
          throw importRowError(`Row ${index + 1}: Invalid date`);
        }
        const account = accountMap.get(row.accountId);
        if (!account) {
          throw importRowError(`Row ${index + 1}: Account not found`);
        }
        if (account.type !== "balance" && account.type !== "investment") {
          throw importRowError(`Row ${index + 1}: Account is not a balance or investment account`);
        }

        pending.push({
          kind: account.type === "balance" ? "balance" : "investment",
          values: {
            id: uuidv4(),
            accountId: account.id,
            balance,
            date: parsedDate,
            createdAt: now,
            fingerprint: decision.fingerprint,
            sourceFingerprint: decision.fingerprint,
          },
        });
        if (account.type === "balance") {
          balanceCount += 1;
        } else {
          investmentCount += 1;
        }
      }

      let importId: string | null = null;
      let isDuplicate = false;
      if (filename && fileHash) {
        const existingImport = txDb
          .select()
          .from(schema.imports)
          .where(eq(schema.imports.fileHash, fileHash))
          .get();
        isDuplicate = Boolean(existingImport);
        importId = uuidv4();
        txDb
          .insert(schema.imports)
          .values({
            id: importId,
            type: "balances",
            filename,
            fileHash,
            rowCount: balanceCount + investmentCount,
            createdAt: now,
          })
          .run();
      }

      for (const entry of pending) {
        const values = { ...entry.values, importId };
        if (entry.kind === "balance") {
          txDb.insert(schema.balanceHistory).values(values as typeof schema.balanceHistory.$inferInsert).run();
        } else {
          txDb
            .insert(schema.investmentHistory)
            .values(values as typeof schema.investmentHistory.$inferInsert)
            .run();
        }
      }

      return {
        balances: balanceCount,
        investments: investmentCount,
        skippedDuplicates,
        skippedIndexes,
        flaggedDuplicates,
        importId,
        isDuplicate,
      };
    }, { behavior: "immediate" });

    return { status: 200, payload: { success: true, ...result } };
  } catch (error) {
    if (isImportRowError(error)) {
      return { status: 400, payload: { error: error.message } };
    }
    const message = error instanceof Error ? error.message : "Failed to import balances";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing balances:", error);
    return { status, payload: { error: message } };
  }
};
