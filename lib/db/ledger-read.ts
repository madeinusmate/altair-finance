import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "./index";

type Db = ReturnType<typeof getDb>;

export type ClientTransaction = {
  id: string;
  accountId: string;
  type: "debit" | "credit";
  categoryId: number | null;
  category: string;
  color: string | null;
  icon: string | null;
  amount: number;
  description: string | null;
  date: Date;
  metadata: string | null;
  createdAt: Date;
  importId: string | null;
};

export type ClientTransfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number | null;
  categoryId: number | null;
  category: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  date: Date;
  createdAt: Date;
  importId: string | null;
};

const transactionColumns = {
  id: schema.transactions.id,
  accountId: schema.transactions.accountId,
  type: schema.transactions.type,
  categoryId: schema.transactions.categoryId,
  category: schema.transactionCategories.name,
  color: schema.transactionCategories.color,
  icon: schema.transactionCategories.icon,
  amount: schema.transactions.amount,
  description: schema.transactions.description,
  date: schema.transactions.date,
  metadata: schema.transactions.metadata,
  createdAt: schema.transactions.createdAt,
  importId: schema.transactions.importId,
};

const transferColumns = {
  id: schema.transfers.id,
  fromAccountId: schema.transfers.fromAccountId,
  toAccountId: schema.transfers.toAccountId,
  amount: schema.transfers.amount,
  fromAmount: schema.transfers.fromAmount,
  toAmount: schema.transfers.toAmount,
  exchangeRate: schema.transfers.exchangeRate,
  categoryId: schema.transfers.categoryId,
  category: schema.transactionCategories.name,
  color: schema.transactionCategories.color,
  icon: schema.transactionCategories.icon,
  description: schema.transfers.description,
  date: schema.transfers.date,
  createdAt: schema.transfers.createdAt,
  importId: schema.transfers.importId,
};

const whereClause = (conditions: SQL[]): SQL | undefined => {
  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions);
};

export const listClientTransactions = (
  db: Db,
  filter?: { accountId?: string; id?: string }
): ClientTransaction[] => {
  const conditions: SQL[] = [];
  if (filter?.accountId) {
    conditions.push(eq(schema.transactions.accountId, filter.accountId));
  }
  if (filter?.id) {
    conditions.push(eq(schema.transactions.id, filter.id));
  }

  const rows = db
    .select(transactionColumns)
    .from(schema.transactions)
    .leftJoin(
      schema.transactionCategories,
      eq(schema.transactions.categoryId, schema.transactionCategories.id)
    )
    .where(whereClause(conditions))
    .orderBy(desc(schema.transactions.date))
    .all();

  return rows.map((row) => ({
    ...row,
    category: row.category ?? "",
  }));
};

export const listClientTransfers = (
  db: Db,
  filter?: { accountId?: string; id?: string }
): ClientTransfer[] => {
  const conditions: SQL[] = [];
  if (filter?.accountId) {
    conditions.push(
      or(
        eq(schema.transfers.fromAccountId, filter.accountId),
        eq(schema.transfers.toAccountId, filter.accountId)
      )!
    );
  }
  if (filter?.id) {
    conditions.push(eq(schema.transfers.id, filter.id));
  }

  const rows = db
    .select(transferColumns)
    .from(schema.transfers)
    .leftJoin(
      schema.transactionCategories,
      eq(schema.transfers.categoryId, schema.transactionCategories.id)
    )
    .where(whereClause(conditions))
    .orderBy(desc(schema.transfers.date))
    .all();

  return rows.map((row) => ({
    ...row,
    category: row.category ?? "",
  }));
};
