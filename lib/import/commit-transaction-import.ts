import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isValidCategoryIdForType, isValidTransferCategoryId } from "@/lib/db/category-helpers";
import { transactionFingerprint, transferFingerprint } from "@/lib/import/fingerprint";
import { loadTransactionFingerprints, loadTransferFingerprints } from "@/lib/import/load-fingerprints";
import { planImportRows } from "@/lib/import/plan-import-rows";
import { resolvePayeeId } from "@/lib/payees/assign";
import { identityPayeeName } from "@/lib/payees/draft";

type LedgerDb = ReturnType<typeof getDb>;

type TransactionImportRow = {
  type: "debit" | "credit";
  accountId: string;
  category: string;
  amount: number;
  description?: string | null;
  payeeName?: string | null;
  date: string;
  overrideDuplicate?: boolean;
};

type TransferImportRow = {
  type: "transfer";
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  description?: string | null;
  date: string;
  overrideDuplicate?: boolean;
};

type ImportTransactionRow = TransactionImportRow | TransferImportRow;

export type TransactionImportSuccess = {
  success: true;
  transactions: number;
  transfers: number;
  skippedDuplicates: number;
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

const isTransferRow = (row: ImportTransactionRow): row is TransferImportRow => row.type === "transfer";

type KnownPayee = { name: string; normalizedName: string };

const fingerprintForRow = async (
  row: ImportTransactionRow,
  transferCategoryName: string,
  payees: KnownPayee[]
): Promise<string | null> => {
  if (!row || typeof row !== "object") {
    return null;
  }
  if (row.type === "transfer") {
    return transferFingerprint({
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      date: row.date,
      amount: row.fromAmount,
      fromAmount: row.fromAmount,
      toAmount: row.toAmount,
      description: row.description,
      payee: "",
      category: transferCategoryName,
    });
  }
  return transactionFingerprint({
    accountId: row.accountId,
    date: row.date,
    amount: row.amount,
    description: row.description,
    payee: identityPayeeName(row.payeeName, payees),
    category: row.category,
    type: row.type,
  });
};

const requireDate = (value: string, index: number): Date => {
  if (!value) {
    throw importRowError(`Row ${index + 1}: Date is required`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw importRowError(`Row ${index + 1}: Invalid date`);
  }
  return parsed;
};

export const commitTransactionImport = async (
  db: LedgerDb,
  body: { rows?: ImportTransactionRow[]; filename?: string; fileHash?: string }
): Promise<{ status: number; payload: TransactionImportSuccess | { error: string } }> => {
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  const filename = body?.filename;
  const fileHash = body?.fileHash;

  if (!rows || rows.length === 0) {
    return { status: 400, payload: { error: "Rows are required" } };
  }

  try {
    const categoriesForIdentity = db.select().from(schema.transactionCategories).all();
    const transferCategoryName =
      categoriesForIdentity.find((category) => category.name === "Transfer")?.name ?? "Transfer";
    const knownPayees = db
      .select({ name: schema.payees.name, normalizedName: schema.payees.normalizedName })
      .from(schema.payees)
      .all();
    const fingerprinted = await Promise.all(
      rows.map(async (row) => ({
        row,
        fingerprint: await fingerprintForRow(row, transferCategoryName, knownPayees),
        overrideDuplicate: row?.overrideDuplicate === true,
      }))
    );

    const now = new Date();
    const result = db.transaction((tx) => {
      const txDb = tx as LedgerDb;
      const accounts = txDb.select().from(schema.accounts).all();
      const accountMap = new Map(accounts.map((account) => [account.id, account]));

      const categories = txDb.select().from(schema.transactionCategories).all();
      const categoryByName = new Map(categories.map((category) => [category.name, category]));
      const transferCategory = categoryByName.get("Transfer");

      const transactionAccountIds = fingerprinted
        .filter((entry) => entry.row?.type !== "transfer")
        .map((entry) => (entry.row as TransactionImportRow).accountId);
      const transferAccountIds = fingerprinted
        .filter((entry) => entry.row?.type === "transfer")
        .flatMap((entry) => {
          const row = entry.row as TransferImportRow;
          return [row.fromAccountId, row.toAccountId];
        });

      const existing = loadTransactionFingerprints(txDb, transactionAccountIds);
      for (const hash of loadTransferFingerprints(txDb, transferAccountIds)) {
        existing.add(hash);
      }

      const { decisions, skippedDuplicates } = planImportRows(existing, fingerprinted);

      let transactionCount = 0;
      let transferCount = 0;
      const pending: Array<{ kind: "transaction" | "transfer"; values: Record<string, unknown> }> = [];

      for (const decision of decisions) {
        if (!decision.insert) {
          continue;
        }
        const row = fingerprinted[decision.index].row;
        const index = decision.index;
        if (!row || typeof row !== "object" || !decision.fingerprint) {
          throw importRowError(`Row ${index + 1}: Amount must be a positive number`);
        }

        const parsedDate = requireDate(row.date, index);

        if (isTransferRow(row)) {
          const fromAmount = Number(row.fromAmount);
          const toAmount = Number(row.toAmount);
          if (!Number.isFinite(fromAmount) || fromAmount <= 0 || !Number.isFinite(toAmount) || toAmount <= 0) {
            throw importRowError(`Row ${index + 1}: Both fromAmount and toAmount must be positive numbers`);
          }
          const fromAccount = accountMap.get(row.fromAccountId);
          const toAccount = accountMap.get(row.toAccountId);
          if (!fromAccount || !toAccount) {
            throw importRowError(`Row ${index + 1}: Transfer accounts not found`);
          }
          if (fromAccount.id === toAccount.id) {
            throw importRowError(`Row ${index + 1}: Transfer accounts must be different`);
          }
          if (fromAccount.type === "balance" || toAccount.type === "balance") {
            throw importRowError(`Row ${index + 1}: Transfers cannot use balance accounts`);
          }
          if (fromAccount.currency === toAccount.currency && fromAmount !== toAmount) {
            throw importRowError(
              `Row ${index + 1}: For same-currency transfers, fromAmount and toAmount must be equal`
            );
          }
          const exchangeRate = fromAccount.currency !== toAccount.currency ? toAmount / fromAmount : null;
          if (!transferCategory || !isValidTransferCategoryId(txDb, transferCategory.id)) {
            throw importRowError(`Row ${index + 1}: Transfer category is not available`);
          }
          pending.push({
            kind: "transfer",
            values: {
              id: uuidv4(),
              fromAccountId: fromAccount.id,
              toAccountId: toAccount.id,
              amount: fromAmount,
              fromAmount,
              toAmount,
              exchangeRate,
              categoryId: transferCategory.id,
              description: row.description || null,
              date: parsedDate,
              createdAt: now,
              fingerprint: decision.fingerprint,
              sourceFingerprint: decision.fingerprint,
            },
          });
          transferCount += 1;
        } else {
          const amount = Number(row.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            throw importRowError(`Row ${index + 1}: Amount must be a positive number`);
          }
          const account = accountMap.get(row.accountId);
          if (!account) {
            throw importRowError(`Row ${index + 1}: Account not found`);
          }
          if (account.type !== "transaction") {
            throw importRowError(`Row ${index + 1}: Transactions must use transaction accounts`);
          }
          if (row.type !== "debit" && row.type !== "credit") {
            throw importRowError(`Row ${index + 1}: Type must be debit or credit`);
          }
          const category = row.category ? categoryByName.get(row.category) : undefined;
          if (!category) {
            const categoryNames = categories.map((item) => item.name).join(", ");
            throw importRowError(`Row ${index + 1}: Invalid category. Valid categories: ${categoryNames}`);
          }
          if (!isValidCategoryIdForType(txDb, category.id, row.type)) {
            throw importRowError(
              `Row ${index + 1}: Category "${row.category}" does not match transaction type "${row.type}"`
            );
          }
          pending.push({
            kind: "transaction",
            values: {
              id: uuidv4(),
              accountId: account.id,
              type: row.type,
              category: category.name,
              categoryId: category.id,
              amount,
              description: row.description || null,
              payeeId: resolvePayeeId(txDb, row.payeeName),
              date: parsedDate,
              createdAt: now,
              fingerprint: decision.fingerprint,
              sourceFingerprint: decision.fingerprint,
            },
          });
          transactionCount += 1;
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
            type: "transactions",
            filename,
            fileHash,
            rowCount: transactionCount + transferCount,
            createdAt: now,
          })
          .run();
      }

      for (const entry of pending) {
        if (entry.kind === "transfer") {
          txDb
            .insert(schema.transfers)
            .values({ ...entry.values, importId } as typeof schema.transfers.$inferInsert)
            .run();
        } else {
          txDb
            .insert(schema.transactions)
            .values({ ...entry.values, importId } as typeof schema.transactions.$inferInsert)
            .run();
        }
      }

      return {
        transactions: transactionCount,
        transfers: transferCount,
        skippedDuplicates,
        importId,
        isDuplicate,
      };
    }, { behavior: "immediate" });

    return { status: 200, payload: { success: true, ...result } };
  } catch (error) {
    if (isImportRowError(error)) {
      return { status: 400, payload: { error: error.message } };
    }
    const message = error instanceof Error ? error.message : "Failed to import transactions";
    const status = message.startsWith("Row ") ? 400 : 500;
    console.error("Error importing transactions:", error);
    return { status, payload: { error: message } };
  }
};
