import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";

export const parseCategoryId = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
};

const categoryMatchesType = (
  transactionType: string | null,
  expected: "debit" | "credit"
): boolean => {
  if (transactionType === null) {
    return true;
  }
  return transactionType === expected;
};

/**
 * Check if a transaction category exists in the database
 */
export const isValidTransactionCategory = (db: ReturnType<typeof getDb>, category: string): boolean => {
  const categoryRecord = db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.name, category))
    .get();
  return !!categoryRecord;
};

/**
 * Check if a transaction category exists and is valid for the given transaction type
 * Returns true if:
 * - Category exists AND transactionType matches the transaction type, OR
 * - Category exists AND transactionType is NULL (special category like Transfer)
 */
export const isValidTransactionCategoryForType = (
  db: ReturnType<typeof getDb>,
  category: string,
  transactionType: "debit" | "credit"
): boolean => {
  const categoryRecord = db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.name, category))
    .get();

  if (!categoryRecord) {
    return false;
  }

  // If transactionType is NULL, it's a special category (like Transfer) that bypasses constraints
  if (categoryRecord.transactionType === null) {
    return true;
  }

  // Otherwise, transactionType must match
  return categoryRecord.transactionType === transactionType;
};

export const isValidCategoryIdForType = (
  db: ReturnType<typeof getDb>,
  categoryId: number,
  transactionType: "debit" | "credit"
): boolean => {
  const categoryRecord = db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.id, categoryId))
    .get();

  if (!categoryRecord) {
    return false;
  }

  return categoryMatchesType(categoryRecord.transactionType, transactionType);
};

export const isValidTransferCategoryId = (
  db: ReturnType<typeof getDb>,
  categoryId: number
): boolean => {
  const categoryRecord = db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.id, categoryId))
    .get();

  if (!categoryRecord) {
    return false;
  }

  return categoryRecord.transactionType === null;
};

/**
 * Get all transaction category names from the database
 */
export const getTransactionCategoryNames = (db: ReturnType<typeof getDb>): string[] => {
  const categories = db.select().from(schema.transactionCategories).all();
  return categories.map((c) => c.name);
};

/**
 * Check if an account category identifier exists in the database
 */
export const isValidAccountCategoryIdentifier = (db: ReturnType<typeof getDb>, identifier: string): boolean => {
  const categoryRecord = db
    .select()
    .from(schema.accountCategories)
    .where(eq(schema.accountCategories.identifier, identifier))
    .get();
  return !!categoryRecord;
};

/**
 * Get all account category identifiers from the database
 */
export const getAccountCategoryIdentifiers = (db: ReturnType<typeof getDb>): string[] => {
  const categories = db.select().from(schema.accountCategories).all();
  return categories.map((c) => c.identifier);
};

/**
 * Get account category by identifier, returns the display name
 */
export const getAccountCategoryName = (db: ReturnType<typeof getDb>, identifier: string): string | null => {
  const category = db
    .select()
    .from(schema.accountCategories)
    .where(eq(schema.accountCategories.identifier, identifier))
    .get();
  return category?.name || null;
};
