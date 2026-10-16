import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";

type Db = ReturnType<typeof getDb>;

export const parseCategoryId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

export const loadTransactionCategoryById = (db: Db, categoryId: number) => {
  return db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.id, categoryId))
    .get();
};

const loadCategoryByName = (db: Db, category: string) => {
  return db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.name, category))
    .get();
};

/**
 * Check if a transaction category exists in the database
 */
export const isValidTransactionCategory = (db: Db, category: string): boolean => {
  return !!loadCategoryByName(db, category);
};

/**
 * A null transaction_type is allowed on debit and credit. Otherwise the type must match.
 */
export const isValidCategoryIdForType = (
  db: Db,
  categoryId: number,
  transactionType: "debit" | "credit"
): boolean => {
  const categoryRecord = loadTransactionCategoryById(db, categoryId);
  if (!categoryRecord) {
    return false;
  }
  if (categoryRecord.transactionType === null) {
    return true;
  }
  return categoryRecord.transactionType === transactionType;
};

/**
 * Transfers may only use a catalog row whose transaction_type is null.
 * Rows already pointing at a typed category stay valid until they are edited.
 */
export const isValidTransferCategoryId = (db: Db, categoryId: number): boolean => {
  const categoryRecord = loadTransactionCategoryById(db, categoryId);
  if (!categoryRecord) {
    return false;
  }
  return categoryRecord.transactionType === null;
};

/**
 * Name lookup kept for the import review UI, which still edits names before commit.
 */
export const isValidTransactionCategoryForType = (
  db: Db,
  category: string,
  transactionType: "debit" | "credit"
): boolean => {
  const categoryRecord = loadCategoryByName(db, category);
  if (!categoryRecord) {
    return false;
  }
  return isValidCategoryIdForType(db, categoryRecord.id, transactionType);
};

/**
 * Get all transaction category names from the database
 */
export const getTransactionCategoryNames = (db: Db): string[] => {
  const categories = db.select().from(schema.transactionCategories).all();
  return categories.map((c) => c.name);
};

/**
 * Check if an account category identifier exists in the database
 */
export const isValidAccountCategoryIdentifier = (db: Db, identifier: string): boolean => {
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
export const getAccountCategoryIdentifiers = (db: Db): string[] => {
  const categories = db.select().from(schema.accountCategories).all();
  return categories.map((c) => c.identifier);
};

/**
 * Get account category by identifier, returns the display name
 */
export const getAccountCategoryName = (db: Db, identifier: string): string | null => {
  const category = db
    .select()
    .from(schema.accountCategories)
    .where(eq(schema.accountCategories.identifier, identifier))
    .get();
  return category?.name || null;
};
