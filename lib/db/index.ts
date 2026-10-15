import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as crypto from "crypto";
import path from "path";
import fs from "fs";
import {
  balanceFingerprintPayload,
  transactionFingerprintPayload,
  transferFingerprintPayload,
} from "../import/fingerprint";

type DatabaseInstance = InstanceType<typeof Database>;

const getDbPath = (): string => {
  // ELECTRON_USER_DATA is set by the Electron main process when spawning Next.js.
  const electronUserData = process.env.ELECTRON_USER_DATA;
  if (electronUserData) {
    return path.join(electronUserData, "netly.db");
  }
  return path.join(process.cwd(), "data", "netly.db");
};

const META_ID = "primary";
const SCHEMA_VERSION = 1;

// Store for database connections keyed by derived key hash
const connectionCache = new Map<string, BetterSQLite3Database<typeof schema>>();

const escapeSqlString = (value: string): string => {
  return value.replaceAll("'", "''");
};

const applyCipherPragmas = (sqlite: DatabaseInstance, encryptionKey: string): void => {
  sqlite.pragma("cipher = 'sqlcipher'");
  sqlite.pragma("legacy = 4");
  sqlite.pragma(`key = '${escapeSqlString(encryptionKey)}'`);
  sqlite.pragma("journal_mode = WAL");
};

const openSqlite = (encryptionKey: string): DatabaseInstance => {
  const dbPath = getDbPath();
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  applyCipherPragmas(sqlite, encryptionKey);
  return sqlite;
};

const dropOpenBankingTokenTables = (sqlite: DatabaseInstance): void => {
  try {
    sqlite.exec(`
      DROP TABLE IF EXISTS open_banking_tokens;
      DROP TABLE IF EXISTS open_banking_client_tokens;
    `);
  } catch (error) {
    console.warn("[DB Migration] Could not drop open banking token tables:", error);
  }
};

const ensureCategorizationRulesTable = (sqlite: DatabaseInstance): void => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categorization_rules (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'exact',
      category_name TEXT NOT NULL,
      transaction_type TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categorization_rules_pattern_type
      ON categorization_rules(pattern, ifnull(transaction_type, ''));
  `);
};

const ensureUserSettingsColumns = (sqlite: DatabaseInstance): void => {
  const table = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_settings'")
    .get();
  if (!table) return;

  const columns = sqlite.prepare("PRAGMA table_info(user_settings)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("install_id")) {
    sqlite.exec("ALTER TABLE user_settings ADD COLUMN install_id TEXT");
  }
  if (!names.has("email")) {
    sqlite.exec("ALTER TABLE user_settings ADD COLUMN email TEXT");
  }
  if (!names.has("preferred_currency")) {
    sqlite.exec("ALTER TABLE user_settings ADD COLUMN preferred_currency TEXT");
  }
  if (!names.has("avatar")) {
    sqlite.exec("ALTER TABLE user_settings ADD COLUMN avatar TEXT");
  }
  if (!names.has("enabled_currencies")) {
    sqlite.exec("ALTER TABLE user_settings ADD COLUMN enabled_currencies TEXT");
  }
};

const FINGERPRINT_TABLES = ["transactions", "transfers", "balance_history", "investment_history"] as const;

const tableExists = (sqlite: DatabaseInstance, tableName: string): boolean => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
};

const tableColumnNames = (sqlite: DatabaseInstance, tableName: string): Set<string> => {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
};

const hashFingerprintPayload = (payload: string): string =>
  crypto.createHash("sha256").update(payload).digest("hex");

const backfillLedgerFingerprints = (sqlite: DatabaseInstance): void => {
  if (tableExists(sqlite, "transactions")) {
    const rows = sqlite
      .prepare(
        `SELECT id, account_id, type, amount, description, date
         FROM transactions
         WHERE fingerprint IS NULL`
      )
      .all() as Array<{
      id: string;
      account_id: string;
      type: string;
      amount: number;
      description: string | null;
      date: number;
    }>;
    const update = sqlite.prepare(
      `UPDATE transactions
       SET fingerprint = ?, source_fingerprint = ?
       WHERE id = ? AND fingerprint IS NULL`
    );
    const write = sqlite.transaction(() => {
      for (const row of rows) {
        const payload = transactionFingerprintPayload({
          accountId: row.account_id,
          date: row.date,
          amount: row.amount,
          description: row.description,
          type: row.type,
        });
        if (!payload) {
          continue;
        }
        const hash = hashFingerprintPayload(payload);
        update.run(hash, hash, row.id);
      }
    });
    write();
  }

  if (tableExists(sqlite, "transfers") && tableColumnNames(sqlite, "transfers").has("fingerprint")) {
    const transferColumns = tableColumnNames(sqlite, "transfers");
    const fromAmountSql = transferColumns.has("from_amount") ? "from_amount" : "NULL";
    const toAmountSql = transferColumns.has("to_amount") ? "to_amount" : "NULL";
    const rows = sqlite
      .prepare(
        `SELECT id, from_account_id, to_account_id, amount, ${fromAmountSql} AS from_amount, ${toAmountSql} AS to_amount, date
         FROM transfers
         WHERE fingerprint IS NULL`
      )
      .all() as Array<{
      id: string;
      from_account_id: string;
      to_account_id: string;
      amount: number;
      from_amount: number | null;
      to_amount: number | null;
      date: number;
    }>;
    const update = sqlite.prepare(
      `UPDATE transfers
       SET fingerprint = ?, source_fingerprint = ?
       WHERE id = ? AND fingerprint IS NULL`
    );
    const write = sqlite.transaction(() => {
      for (const row of rows) {
        const payload = transferFingerprintPayload({
          fromAccountId: row.from_account_id,
          toAccountId: row.to_account_id,
          date: row.date,
          fromAmount: row.from_amount ?? row.amount,
          toAmount: row.to_amount ?? row.amount,
        });
        if (!payload) {
          continue;
        }
        const hash = hashFingerprintPayload(payload);
        update.run(hash, hash, row.id);
      }
    });
    write();
  }

  if (tableExists(sqlite, "balance_history")) {
    const rows = sqlite
      .prepare(
        `SELECT id, account_id, balance, date
         FROM balance_history
         WHERE fingerprint IS NULL`
      )
      .all() as Array<{ id: string; account_id: string; balance: number; date: number }>;
    const update = sqlite.prepare(
      `UPDATE balance_history
       SET fingerprint = ?, source_fingerprint = ?
       WHERE id = ? AND fingerprint IS NULL`
    );
    const write = sqlite.transaction(() => {
      for (const row of rows) {
        const payload = balanceFingerprintPayload({
          accountId: row.account_id,
          date: row.date,
          balance: row.balance,
        });
        if (!payload) {
          continue;
        }
        const hash = hashFingerprintPayload(payload);
        update.run(hash, hash, row.id);
      }
    });
    write();
  }

  if (tableExists(sqlite, "investment_history")) {
    const rows = sqlite
      .prepare(
        `SELECT id, account_id, balance, date
         FROM investment_history
         WHERE fingerprint IS NULL`
      )
      .all() as Array<{ id: string; account_id: string; balance: number; date: number }>;
    const update = sqlite.prepare(
      `UPDATE investment_history
       SET fingerprint = ?, source_fingerprint = ?
       WHERE id = ? AND fingerprint IS NULL`
    );
    const write = sqlite.transaction(() => {
      for (const row of rows) {
        const payload = balanceFingerprintPayload({
          accountId: row.account_id,
          date: row.date,
          balance: row.balance,
        });
        if (!payload) {
          continue;
        }
        const hash = hashFingerprintPayload(payload);
        update.run(hash, hash, row.id);
      }
    });
    write();
  }
};

const ensureLedgerFingerprintColumns = (sqlite: DatabaseInstance): void => {
  for (const tableName of FINGERPRINT_TABLES) {
    if (!tableExists(sqlite, tableName)) {
      continue;
    }
    const names = tableColumnNames(sqlite, tableName);
    if (!names.has("fingerprint")) {
      sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN fingerprint TEXT`);
    }
    if (!names.has("source_fingerprint")) {
      sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN source_fingerprint TEXT`);
    }
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_${tableName}_fingerprint ON ${tableName}(fingerprint)`);
    sqlite.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_source_fingerprint ON ${tableName}(source_fingerprint)`
    );
  }
  backfillLedgerFingerprints(sqlite);
};

export const runMigrations = (sqlite: DatabaseInstance): void => {
  try {
    // Drop before the transfers early-return below so an old file that lacks
    // transfers still loses provider access tokens and refresh tokens on open.
    dropOpenBankingTokenTables(sqlite);
    ensureCategorizationRulesTable(sqlite);
    ensureUserSettingsColumns(sqlite);
    ensureLedgerFingerprintColumns(sqlite);

    // Migration: Create imports table if it doesn't exist
    const importsTableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='imports'
    `).get();
    
    if (!importsTableCheck) {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS imports (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('transactions', 'balances')),
          filename TEXT NOT NULL,
          file_hash TEXT NOT NULL,
          row_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_imports_type ON imports(type);
        CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports(created_at);
        CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON imports(file_hash);
      `);
    }

    // Migration: Add transaction_type column to transaction_categories
    const categoriesTableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='transaction_categories'
    `).get();
    
    if (categoriesTableCheck) {
      const categoryColumns = sqlite.prepare("PRAGMA table_info(transaction_categories)").all() as Array<{ name: string }>;
      const categoryColumnNames = categoryColumns.map((col) => col.name);
      
      if (!categoryColumnNames.includes("transaction_type")) {
        console.log("[DB Migration] Adding transaction_type column to transaction_categories");
        sqlite.exec("ALTER TABLE transaction_categories ADD COLUMN transaction_type TEXT");
        console.log("[DB Migration] Successfully added transaction_type column");
      }
    }

    // Migration: Add new columns to transfers table if they don't exist
    // First check if transfers table exists
    const tableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='transfers'
    `).get();
    
    if (!tableCheck) {
      // Table doesn't exist yet, skip migration (initializeDb will create it)
      return;
    }

    // Check if columns exist by querying pragma_table_info
    const columns = sqlite.prepare("PRAGMA table_info(transfers)").all() as Array<{ name: string }>;
    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes("from_amount")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN from_amount REAL");
    }
    if (!columnNames.includes("to_amount")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN to_amount REAL");
    }
    if (!columnNames.includes("exchange_rate")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN exchange_rate REAL");
    }
    if (!columnNames.includes("category")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN category TEXT NOT NULL DEFAULT 'Transfer'");
    }

    // Migrate existing data: populate from_amount and to_amount from amount
    // Only update rows where from_amount is NULL (not yet migrated)
    sqlite.exec(`
      UPDATE transfers 
      SET from_amount = amount, to_amount = amount, exchange_rate = NULL
      WHERE (from_amount IS NULL OR to_amount IS NULL) AND amount IS NOT NULL
    `);

    // Migrate existing transfers: set category to 'Transfer' if NULL
    sqlite.exec(`
      UPDATE transfers 
      SET category = 'Transfer'
      WHERE category IS NULL
    `);

    // Migration: Add import_id columns to existing tables
    try {
      const tables = ["transactions", "transfers", "balance_history", "investment_history"];
      for (const tableName of tables) {
        const tableCheck = sqlite.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(tableName);
        
        if (tableCheck) {
          const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
          const columnNames = columns.map((col) => col.name);
          
          if (!columnNames.includes("import_id")) {
            sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN import_id TEXT REFERENCES imports(id) ON DELETE SET NULL`);
          }
        }
      }
    } catch (error) {
      console.warn("[DB Migration] Could not add import_id columns:", error);
    }

    // Migration: Add metadata columns to accounts and transactions
    try {
      const accountsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='accounts'
      `).get();
      
      if (accountsTableCheck) {
        const columns = sqlite.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>;
        const columnNames = columns.map((col) => col.name);
        
        if (!columnNames.includes("metadata")) {
          sqlite.exec("ALTER TABLE accounts ADD COLUMN metadata TEXT");
        }
      }

      const transactionsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='transactions'
      `).get();
      
      if (transactionsTableCheck) {
        const columns = sqlite.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
        const columnNames = columns.map((col) => col.name);
        
        if (!columnNames.includes("metadata")) {
          sqlite.exec("ALTER TABLE transactions ADD COLUMN metadata TEXT");
        }
      }
    } catch (error) {
      console.warn("[DB Migration] Could not add metadata columns:", error);
    }

    // Migration: Create budgets table if it doesn't exist
    try {
      const budgetsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='budgets'
      `).get();
      
      if (!budgetsTableCheck) {
        sqlite.exec(`
          CREATE TABLE budgets (
            id TEXT PRIMARY KEY,
            category_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_budgets_category_name ON budgets(category_name);
        `);
        
        // Create index on transactions table if it exists
        const transactionsTableCheck = sqlite.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='transactions'
        `).get();
        
        if (transactionsTableCheck) {
          try {
            sqlite.exec(`
              CREATE INDEX IF NOT EXISTS idx_transactions_category_date_type ON transactions(category, date, type);
            `);
          } catch (indexError) {
            console.warn("[DB Migration] Could not create transactions index:", indexError);
          }
        }
      }
    } catch (error) {
      console.warn("[DB Migration] Could not create budgets table:", error);
    }

  } catch (error) {
    // Ignore migration errors - they might occur if table structure is unexpected
    console.warn("[DB Migration] Could not run migrations:", error);
  }
};

export const getDb = (encryptionKey: string): BetterSQLite3Database<typeof schema> => {
  const keyHash = crypto.createHash("sha256").update(encryptionKey).digest("hex").slice(0, 16);
  
  if (connectionCache.has(keyHash)) {
    return connectionCache.get(keyHash)!;
  }

  const sqlite = openSqlite(encryptionKey);
  
  // Run migrations before creating drizzle instance
  // This ensures columns exist before Drizzle tries to query them
  runMigrations(sqlite);
  
  const db = drizzle(sqlite, { schema });
  connectionCache.set(keyHash, db);

  return db;
};

export const initializeDb = (encryptionKey: string, username: string): void => {
  const sqlite = openSqlite(encryptionKey);
  
  // Check if database is brand new (no tables exist)
  const tableCount = sqlite.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).get() as { count: number };
  
  const isFreshDatabase = tableCount.count === 0;
  
  if (isFreshDatabase) {
    console.log("[DB Init] Fresh database detected - creating schema with all columns");
  } else {
    console.log("[DB Init] Existing database detected - will run migrations if needed");
  }
  
  // Create all tables with current schema (includes all columns)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS transaction_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      transaction_type TEXT,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('balance', 'transaction', 'investment')),
      nature TEXT NOT NULL CHECK (nature IN ('asset', 'liability')),
      category TEXT NOT NULL,
      currency TEXT NOT NULL,
      initial_balance REAL NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      fingerprint TEXT,
      source_fingerprint TEXT
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      from_amount REAL,
      to_amount REAL,
      exchange_rate REAL,
      category TEXT NOT NULL DEFAULT 'Transfer',
      description TEXT,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      fingerprint TEXT,
      source_fingerprint TEXT
    );

    CREATE TABLE IF NOT EXISTS balance_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      balance REAL NOT NULL,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      fingerprint TEXT,
      source_fingerprint TEXT
    );

    CREATE TABLE IF NOT EXISTS investment_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      balance REAL NOT NULL,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      fingerprint TEXT,
      source_fingerprint TEXT
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('transactions', 'balances')),
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate TEXT NOT NULL,
      effective_date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_from_account_id ON transfers(from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_to_account_id ON transfers(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_balance_history_account_id ON balance_history(account_id);
    CREATE INDEX IF NOT EXISTS idx_investment_history_account_id ON investment_history(account_id);
    CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_date ON exchange_rates(base_currency, effective_date);
    CREATE INDEX IF NOT EXISTS idx_imports_type ON imports(type);
    CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports(created_at);
    CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON imports(file_hash);
    CREATE INDEX IF NOT EXISTS idx_transactions_fingerprint ON transactions(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_transactions_source_fingerprint ON transactions(source_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_transfers_fingerprint ON transfers(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_transfers_source_fingerprint ON transfers(source_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_balance_history_fingerprint ON balance_history(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_balance_history_source_fingerprint ON balance_history(source_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_investment_history_fingerprint ON investment_history(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_investment_history_source_fingerprint ON investment_history(source_fingerprint);

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY DEFAULT 'user',
      username TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      preferred_currency TEXT,
      enabled_currencies TEXT,
      install_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_budgets_category_name ON budgets(category_name);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_date_type ON transactions(category, date, type);

    CREATE TABLE IF NOT EXISTS categorization_rules (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'exact',
      category_name TEXT NOT NULL,
      transaction_type TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categorization_rules_pattern_type
      ON categorization_rules(pattern, ifnull(transaction_type, ''));

    INSERT INTO meta (id, schema_version, created_at)
    SELECT '${META_ID}', ${SCHEMA_VERSION}, strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM meta WHERE id = '${META_ID}');
  `);

  // Only run migrations if database is NOT fresh (has existing tables)
  // For fresh databases, tables are created with correct schema above, so migrations are unnecessary
  if (!isFreshDatabase) {
    console.log("[DB Init] Running migrations for existing database...");
    
    // Migration: Add new columns to transfers table if they don't exist
    const columns = sqlite.prepare("PRAGMA table_info(transfers)").all() as Array<{ name: string }>;
    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes("from_amount")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN from_amount REAL");
    }
    if (!columnNames.includes("to_amount")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN to_amount REAL");
    }
    if (!columnNames.includes("exchange_rate")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN exchange_rate REAL");
    }
    if (!columnNames.includes("category")) {
      sqlite.exec("ALTER TABLE transfers ADD COLUMN category TEXT NOT NULL DEFAULT 'Transfer'");
    }

    // Migrate existing data: populate from_amount and to_amount from amount
    // Only update rows where from_amount is NULL (not yet migrated)
    sqlite.exec(`
      UPDATE transfers 
      SET from_amount = amount, to_amount = amount, exchange_rate = NULL
      WHERE from_amount IS NULL OR to_amount IS NULL
    `);

    // Migrate existing transfers: set category to 'Transfer' if NULL
    sqlite.exec(`
      UPDATE transfers 
      SET category = 'Transfer'
      WHERE category IS NULL
    `);

    // Migration: Add import_id columns to existing tables
    try {
      const tables = ["transactions", "transfers", "balance_history", "investment_history"];
      for (const tableName of tables) {
        const tableCheck = sqlite.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(tableName);
        
        if (tableCheck) {
          const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
          const columnNames = columns.map((col) => col.name);
          
          if (!columnNames.includes("import_id")) {
            sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN import_id TEXT REFERENCES imports(id) ON DELETE SET NULL`);
          }
        }
      }
    } catch (error) {
      console.warn("[DB Migration] Could not add import_id columns:", error);
    }

    // Migration: Create budgets table if it doesn't exist
    try {
      const budgetsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='budgets'
      `).get();
      
      if (!budgetsTableCheck) {
        sqlite.exec(`
          CREATE TABLE budgets (
            id TEXT PRIMARY KEY,
            category_name TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_budgets_category_name ON budgets(category_name);
          CREATE INDEX IF NOT EXISTS idx_transactions_category_date_type ON transactions(category, date, type);
        `);
      }
    } catch (error) {
      console.warn("[DB Migration] Could not create budgets table:", error);
    }

    // Migration: Add transaction_type column to transaction_categories
    try {
      const categoriesTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='transaction_categories'
      `).get();
      
      if (categoriesTableCheck) {
        const columns = sqlite.prepare("PRAGMA table_info(transaction_categories)").all() as Array<{ name: string }>;
        const columnNames = columns.map((col) => col.name);
        
        if (!columnNames.includes("transaction_type")) {
          console.log("[DB Migration] Adding transaction_type column to transaction_categories");
          sqlite.exec("ALTER TABLE transaction_categories ADD COLUMN transaction_type TEXT");
          console.log("[DB Migration] Successfully added transaction_type column");
        }
      }
    } catch (error) {
      console.error("[DB Migration] Error adding transaction_type column:", error);
      throw error; // Re-throw to prevent seeding with wrong schema
    }

    // Migration: Add metadata columns to accounts and transactions
    try {
      const accountsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='accounts'
      `).get();
      
      if (accountsTableCheck) {
        const columns = sqlite.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>;
        const columnNames = columns.map((col) => col.name);
        
        if (!columnNames.includes("metadata")) {
          sqlite.exec("ALTER TABLE accounts ADD COLUMN metadata TEXT");
        }
      }

      const transactionsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='transactions'
      `).get();
      
      if (transactionsTableCheck) {
        const columns = sqlite.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
        const columnNames = columns.map((col) => col.name);
        
        if (!columnNames.includes("metadata")) {
          sqlite.exec("ALTER TABLE transactions ADD COLUMN metadata TEXT");
        }
      }
    } catch (error) {
      console.warn("[DB Migration] Could not add metadata columns:", error);
    }

    dropOpenBankingTokenTables(sqlite);

    // Migration: Create user_settings table
    try {
      const userSettingsTableCheck = sqlite.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='user_settings'
      `).get();
      
      if (!userSettingsTableCheck) {
        sqlite.exec(`
          CREATE TABLE user_settings (
            id TEXT PRIMARY KEY DEFAULT 'user',
            username TEXT NOT NULL,
            email TEXT,
            avatar TEXT,
            preferred_currency TEXT,
            enabled_currencies TEXT,
            install_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `);
      }
      ensureUserSettingsColumns(sqlite);
    } catch (error) {
      console.warn("[DB Migration] Could not create user_settings table:", error);
    }

    try {
      ensureCategorizationRulesTable(sqlite);
    } catch (error) {
      console.warn("[DB Migration] Could not create categorization_rules table:", error);
    }

    try {
      ensureLedgerFingerprintColumns(sqlite);
    } catch (error) {
      console.warn("[DB Migration] Could not add ledger fingerprints:", error);
    }
    
    console.log("[DB Init] Migrations completed");
  } else {
    console.log("[DB Init] Fresh database - skipping migrations (schema already correct)");
  }

  // Seed default categories if tables are empty
  seedDefaultCategories(sqlite);

  // Store username in user_settings
  const now = Math.floor(Date.now() / 1000);
  try {
    const existingUser = sqlite.prepare("SELECT id FROM user_settings WHERE id = 'user'").get();
    if (existingUser) {
      sqlite.prepare(`
        UPDATE user_settings 
        SET username = ?, updated_at = ?
        WHERE id = 'user'
      `).run(username, now);
    } else {
      sqlite.prepare(`
        INSERT INTO user_settings (id, username, created_at, updated_at)
        VALUES ('user', ?, ?, ?)
      `).run(username, now, now);
    }
  } catch (error) {
    console.warn("[DB Init] Could not store username:", error);
  }

  sqlite.close();
};

const seedDefaultCategories = (sqlite: DatabaseInstance): void => {
  const now = Math.floor(Date.now() / 1000);

  // Seed transaction categories
  const transactionCategoryCount = sqlite.prepare("SELECT COUNT(*) as count FROM transaction_categories").get() as { count: number };
  if (transactionCategoryCount.count === 0) {
    // Verify transaction_type column exists before seeding (safety check)
    // This should always pass because:
    // - Fresh DB: Column created in CREATE TABLE statement above
    // - Existing DB: Column added by migration before seedDefaultCategories is called
    const columns = sqlite.prepare("PRAGMA table_info(transaction_categories)").all() as Array<{ name: string }>;
    const columnNames = columns.map((col) => col.name);
    
    if (!columnNames.includes("transaction_type")) {
      console.error("[DB Seed] ERROR: transaction_type column does not exist! Cannot seed categories properly.");
      throw new Error("transaction_type column must exist before seeding categories");
    }

    // Debit categories (expenses)
    const defaultDebitCategories = [
      "Shopping",
      "Travel",
      "ATM Withdrawal",
      "Entertainment",
      "Health & Personal Care",
      "Food & Drink",
      "Taxes",
      "Rent & Utilities",
      "Subscriptions",
      "Home Improvement",
      "Auto & Transport",
      "Fees",
      "Other Expenses",
      "Utilities",
      "Wedding",
    ];

    // Credit categories (income)
    const defaultCreditCategories = [
      "Salary",
      "Investment",
      "Other Income",
      "Capital Gain Income",
    ];

    // Special category for transfers
    const transferCategory = "Transfer";

    const insertTxCategory = sqlite.prepare(`
      INSERT INTO transaction_categories (name, transaction_type, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    // Insert debit categories
    for (const name of defaultDebitCategories) {
      insertTxCategory.run(name, "debit", now, now);
    }

    // Insert credit categories
    for (const name of defaultCreditCategories) {
      insertTxCategory.run(name, "credit", now, now);
    }

    // Insert Transfer category (transaction_type = NULL)
    insertTxCategory.run(transferCategory, null, now, now);

    // Verify the inserted categories have correct transaction_type values
    const verifyCategories = sqlite.prepare(`
      SELECT name, transaction_type FROM transaction_categories
    `).all() as Array<{ name: string; transaction_type: string | null }>;
    
    console.log(`[DB Seed] Seeded ${verifyCategories.length} transaction categories`);
    const debitCount = verifyCategories.filter(c => c.transaction_type === "debit").length;
    const creditCount = verifyCategories.filter(c => c.transaction_type === "credit").length;
    const transferCount = verifyCategories.filter(c => c.transaction_type === null).length;
    console.log(`[DB Seed] Verification: ${debitCount} debit, ${creditCount} credit, ${transferCount} transfer categories`);
    
    if (debitCount === 0 && creditCount === 0 && transferCount === verifyCategories.length) {
      console.error("[DB Seed] ERROR: All categories have NULL transaction_type! This indicates a problem with the INSERT statement.");
      throw new Error("Failed to seed categories with correct transaction_type values");
    }
  }

  // Seed account categories
  const accountCategoryCount = sqlite.prepare("SELECT COUNT(*) as count FROM account_categories").get() as { count: number };
  if (accountCategoryCount.count === 0) {
    const defaultAccountCategories: Array<{ identifier: string; name: string }> = [
      { identifier: "auto_loan", name: "Auto Loan" },
      { identifier: "brokerage", name: "Brokerage" },
      { identifier: "cash", name: "Cash" },
      { identifier: "checking", name: "Checking" },
      { identifier: "credit_card", name: "Credit Card" },
      { identifier: "crypto", name: "Crypto" },
      { identifier: "investment", name: "Investment" },
      { identifier: "line_of_credit", name: "Line of Credit" },
      { identifier: "mortgage", name: "Mortgage" },
      { identifier: "other_asset", name: "Other Asset" },
      { identifier: "other_liability", name: "Other Liability" },
      { identifier: "personal_loan", name: "Personal Loan" },
      { identifier: "physical_asset", name: "Physical Asset" },
      { identifier: "real_estate", name: "Real Estate" },
      { identifier: "retirement_401k", name: "Retirement 401k" },
      { identifier: "retirement_ira", name: "Retirement IRA" },
      { identifier: "retirement_other", name: "Retirement Other" },
      { identifier: "retirement_roth_ira", name: "Retirement Roth IRA" },
      { identifier: "savings", name: "Savings" },
      { identifier: "student_loan", name: "Student Loan" },
      { identifier: "vehicle", name: "Vehicle" },
    ];

    const insertAcctCategory = sqlite.prepare(`
      INSERT INTO account_categories (identifier, name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const { identifier, name } of defaultAccountCategories) {
      insertAcctCategory.run(identifier, name, now, now);
    }
  }
};

export const validateKey = (encryptionKey: string): boolean => {
  try {
    const sqlite = openSqlite(encryptionKey);
    const row = sqlite.prepare("SELECT schema_version FROM meta WHERE id = ?").get(META_ID);
    sqlite.close();
    return !!row;
  } catch {
    return false;
  }
};

export const dbFileExists = (): boolean => {
  return fs.existsSync(getDbPath());
};

export { getDbPath };

export const clearConnectionCache = (): void => {
  connectionCache.clear();
};

export { schema };

// Re-export import utilities for convenience
export {
  validateImportedDatabase,
  getDatabaseStats,
  backupDatabase,
  forceCloseConnections,
  extractZipFile,
  type DatabaseStats,
  type ValidationResult,
} from "./import-utils";

export { META_ID, SCHEMA_VERSION };
