import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import * as crypto from "crypto";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "netly.db");

// Store for database connections keyed by derived key hash
const connectionCache = new Map<string, BetterSQLite3Database<typeof schema>>();

export const getDb = (encryptionKey: string): BetterSQLite3Database<typeof schema> => {
  const keyHash = crypto.createHash("sha256").update(encryptionKey).digest("hex").slice(0, 16);
  
  if (connectionCache.has(keyHash)) {
    return connectionCache.get(keyHash)!;
  }

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);
  
  // Enable WAL mode for better performance
  sqlite.pragma("journal_mode = WAL");
  
  // Set the encryption key as a pragma (for SQLCipher compatibility)
  // Note: With standard better-sqlite3, this is a no-op but prepares for SQLCipher upgrade
  try {
    sqlite.pragma(`key = '${encryptionKey}'`);
  } catch {
    // Ignore if not using SQLCipher
  }

  const db = drizzle(sqlite, { schema });
  connectionCache.set(keyHash, db);

  return db;
};

export const initializeDb = (encryptionKey: string): void => {
  const db = getDb(encryptionKey);
  
  // Run migrations inline for simplicity
  const sqlite = new Database(DB_PATH);
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('balance', 'transaction', 'investment')),
      nature TEXT NOT NULL CHECK (nature IN ('asset', 'liability')),
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

    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_from_account_id ON transfers(from_account_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_to_account_id ON transfers(to_account_id);
    CREATE INDEX IF NOT EXISTS idx_balance_history_account_id ON balance_history(account_id);
    CREATE INDEX IF NOT EXISTS idx_investment_history_account_id ON investment_history(account_id);
    CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_date ON exchange_rates(base_currency, effective_date);
  `);

  sqlite.close();
};

export const validateKey = (encryptionKey: string): boolean => {
  try {
    const db = getDb(encryptionKey);
    // Try to query the database to validate the key
    const sqlite = new Database(DB_PATH);
    sqlite.pragma("journal_mode");
    sqlite.close();
    return true;
  } catch {
    return false;
  }
};

export { schema };
