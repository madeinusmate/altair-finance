import Database from "better-sqlite3-multiple-ciphers";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as crypto from "crypto";
import path from "path";
import fs from "fs";

type DatabaseInstance = InstanceType<typeof Database>;

const getDbPath = (): string => {
  // ELECTRON_USER_DATA is set by the Electron main process when spawning Next.js
  // This works for both the Electron renderer and the spawned Next.js server
  const electronUserData = process.env.ELECTRON_USER_DATA;
  
  console.log(`[DB] getDbPath called`);
  console.log(`[DB] ELECTRON_USER_DATA env var: ${electronUserData || "(not set)"}`);
  console.log(`[DB] process.cwd(): ${process.cwd()}`);
  
  if (electronUserData) {
    const dbPath = path.join(electronUserData, "netly.db");
    console.log(`[DB] Using Electron user data path: ${dbPath}`);
    return dbPath;
  }
  
  // Fallback for development (running Next.js directly)
  const devPath = path.join(process.cwd(), "data", "netly.db");
  console.log(`[DB] Using development path: ${devPath}`);
  return devPath;
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

export const getDb = (encryptionKey: string): BetterSQLite3Database<typeof schema> => {
  const keyHash = crypto.createHash("sha256").update(encryptionKey).digest("hex").slice(0, 16);
  
  if (connectionCache.has(keyHash)) {
    return connectionCache.get(keyHash)!;
  }

  const sqlite = openSqlite(encryptionKey);
  const db = drizzle(sqlite, { schema });
  connectionCache.set(keyHash, db);

  return db;
};

export const initializeDb = (encryptionKey: string): void => {
  // Run migrations inline for simplicity
  const sqlite = openSqlite(encryptionKey);
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('balance', 'transaction', 'investment')),
      nature TEXT NOT NULL CHECK (nature IN ('asset', 'liability')),
      category TEXT NOT NULL CHECK (category IN ('auto_loan', 'brokerage', 'cash', 'checking', 'credit_card', 'crypto', 'investment', 'line_of_credit', 'mortgage', 'other_asset', 'other_liability', 'personal_loan', 'physical_asset', 'real_estate', 'retirement_401k', 'retirement_ira', 'retirement_other', 'retirement_roth_ira', 'savings', 'student_loan', 'vehicle')),
      currency TEXT NOT NULL,
      initial_balance REAL NOT NULL DEFAULT 0,
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
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      description TEXT,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balance_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      balance REAL NOT NULL,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investment_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      balance REAL NOT NULL,
      date INTEGER NOT NULL,
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

    INSERT INTO meta (id, schema_version, created_at)
    SELECT '${META_ID}', ${SCHEMA_VERSION}, strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM meta WHERE id = '${META_ID}');
  `);

  sqlite.close();
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
  const dbPath = getDbPath();
  console.log(`[DB] Checking if database exists at: ${dbPath}`);
  return fs.existsSync(dbPath);
};

export { getDbPath };

export const clearConnectionCache = (): void => {
  connectionCache.clear();
};

export { schema };
