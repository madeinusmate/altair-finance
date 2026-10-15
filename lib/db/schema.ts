import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const transactionCategories = sqliteTable("transaction_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  transactionType: text("transaction_type"), // "debit", "credit", or null (for Transfer)
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
  metadata: text("metadata"), // optional JSON; leftover provider payloads stay as stored
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
  // Leftover label from before categories had a stable id. Do not read.
  // Identity is categoryId. A rename must not copy the new name back here.
  category: text("category").notNull(),
  categoryId: integer("category_id").references(() => transactionCategories.id, { onDelete: "restrict" }),
  amount: real("amount").notNull(),
  description: text("description"),
  date: integer("date", { mode: "timestamp" }).notNull(),
  metadata: text("metadata"), // optional JSON; leftover provider payloads stay as stored
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
  // Leftover label from before categories had a stable id. Do not read.
  // Identity is categoryId. A rename must not copy the new name back here.
  category: text("category").notNull().default("Transfer"),
  categoryId: integer("category_id").references(() => transactionCategories.id, { onDelete: "restrict" }),
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

// Kept so existing databases still open. Netly no longer reads or writes these
// tables. Account rows that were linked through a provider stay in `accounts`
// and are edited like any other account. Their metadata JSON is left as-is.
export const openBankingClientTokens = sqliteTable("open_banking_client_tokens", {
  id: text("id").primaryKey().default("client_credentials"),
  accessToken: text("access_token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const openBankingTokens = sqliteTable("open_banking_tokens", {
  loginIdentityId: text("login_identity_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  // Leftover label from before categories had a stable id. Do not read.
  // Identity is categoryId. A rename must not copy the new name back here.
  categoryName: text("category_name").notNull(),
  categoryId: integer("category_id").references(() => transactionCategories.id, { onDelete: "restrict" }),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey().default("user"),
  username: text("username").notNull(),
  email: text("email"),
  avatar: text("avatar"),
  preferredCurrency: text("preferred_currency"),
  enabledCurrencies: text("enabled_currencies"),
  installId: text("install_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
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
export type OpenBankingClientToken = typeof openBankingClientTokens.$inferSelect;
export type NewOpenBankingClientToken = typeof openBankingClientTokens.$inferInsert;
export type OpenBankingToken = typeof openBankingTokens.$inferSelect;
export type NewOpenBankingToken = typeof openBankingTokens.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;