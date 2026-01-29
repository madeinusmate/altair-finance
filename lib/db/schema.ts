import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const transactionCategories = sqliteTable("transaction_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color"),
  icon: text("icon"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const accountCategories = sqliteTable("account_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["balance", "transaction", "investment"] }).notNull(),
  nature: text("nature", { enum: ["asset", "liability"] }).notNull(),
  category: text("category").notNull(),
  currency: text("currency").notNull(),
  initialBalance: real("initial_balance").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["transactions", "balances"] }).notNull(),
  filename: text("filename").notNull(),
  fileHash: text("file_hash").notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["debit", "credit"] }).notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  description: text("description"),
  date: integer("date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  importId: text("import_id").references(() => imports.id, { onDelete: "set null" }),
});

export const transfers = sqliteTable("transfers", {
  id: text("id").primaryKey(),
  fromAccountId: text("from_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  toAccountId: text("to_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(), // Kept for backward compatibility
  fromAmount: real("from_amount").notNull(),
  toAmount: real("to_amount").notNull(),
  exchangeRate: real("exchange_rate"),
  category: text("category").notNull().default("Transfer"),
  description: text("description"),
  date: integer("date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  importId: text("import_id").references(() => imports.id, { onDelete: "set null" }),
});

export const balanceHistory = sqliteTable("balance_history", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  balance: real("balance").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  importId: text("import_id").references(() => imports.id, { onDelete: "set null" }),
});

export const investmentHistory = sqliteTable("investment_history", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  balance: real("balance").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  importId: text("import_id").references(() => imports.id, { onDelete: "set null" }),
});

export const exchangeRates = sqliteTable("exchange_rates", {
  id: text("id").primaryKey(),
  baseCurrency: text("base_currency").notNull(),
  quoteCurrency: text("quote_currency").notNull(),
  rate: text("rate").notNull(),
  effectiveDate: integer("effective_date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const meta = sqliteTable("meta", {
  id: text("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type TransactionCategory = typeof transactionCategories.$inferSelect;
export type NewTransactionCategory = typeof transactionCategories.$inferInsert;
export type AccountCategory = typeof accountCategories.$inferSelect;
export type NewAccountCategory = typeof accountCategories.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Transfer = typeof transfers.$inferSelect;
export type NewTransfer = typeof transfers.$inferInsert;
export type BalanceHistory = typeof balanceHistory.$inferSelect;
export type NewBalanceHistory = typeof balanceHistory.$inferInsert;
export type InvestmentHistory = typeof investmentHistory.$inferSelect;
export type NewInvestmentHistory = typeof investmentHistory.$inferInsert;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
export type Meta = typeof meta.$inferSelect;
export type NewMeta = typeof meta.$inferInsert;
