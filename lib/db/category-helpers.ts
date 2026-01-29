import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";

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
