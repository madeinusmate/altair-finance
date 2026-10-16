import { desc, eq, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

const transactionSelection = {
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

const transferSelection = {
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

export const listTransactions = (db: Db, accountId?: string | null) => {
  const query = db
    .select(transactionSelection)
    .from(schema.transactions)
    .innerJoin(
      schema.transactionCategories,
      eq(schema.transactions.categoryId, schema.transactionCategories.id)
    );

  if (accountId) {
    return query.where(eq(schema.transactions.accountId, accountId)).orderBy(desc(schema.transactions.date)).all();
  }

  return query.orderBy(desc(schema.transactions.date)).all();
};

export const getTransactionById = (db: Db, id: string) => {
  return db
    .select(transactionSelection)
    .from(schema.transactions)
    .innerJoin(
      schema.transactionCategories,
      eq(schema.transactions.categoryId, schema.transactionCategories.id)
    )
    .where(eq(schema.transactions.id, id))
    .get();
};

export const listTransfers = (db: Db, accountId?: string | null) => {
  const query = db
    .select(transferSelection)
    .from(schema.transfers)
    .innerJoin(
      schema.transactionCategories,
      eq(schema.transfers.categoryId, schema.transactionCategories.id)
    );

  if (accountId) {
    return query
      .where(
        or(eq(schema.transfers.fromAccountId, accountId), eq(schema.transfers.toAccountId, accountId))
      )
      .orderBy(desc(schema.transfers.date))
      .all();
  }

  return query.orderBy(desc(schema.transfers.date)).all();
};

export const getTransferById = (db: Db, id: string) => {
  return db
    .select(transferSelection)
    .from(schema.transfers)
    .innerJoin(
      schema.transactionCategories,
      eq(schema.transfers.categoryId, schema.transactionCategories.id)
    )
    .where(eq(schema.transfers.id, id))
    .get();
};
