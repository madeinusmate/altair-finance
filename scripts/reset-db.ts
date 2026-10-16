#!/usr/bin/env tsx

import { databaseFilesIn, getDb, initializeDb } from "../lib/db/index";
import * as fs from "fs";
import * as path from "path";
import { seedDevData } from "./dev-data";

const DB_FILES = databaseFilesIn(path.join(process.cwd(), "data"));

// Get encryption key from environment or argument, or use default
const encryptionKey = process.env.ENCRYPTION_KEY || process.argv[2] || "reset-key-min-8-chars-12345";
// A stand-in profile name. The macOS USERNAME is the real account, so it stays unused.
const DEV_PROFILE_NAME = "Alex Rivera";
const username = process.argv[3] || DEV_PROFILE_NAME;

if (encryptionKey.length < 8) {
  console.error("Error: Encryption key must be at least 8 characters long");
  console.error("Usage: pnpm reset-db [encryption-key]");
  console.error("   or: ENCRYPTION_KEY=your-key pnpm reset-db");
  process.exit(1);
}

console.log("🗑️  Resetting database...\n");

// Delete the current database and a database left under the previous name.
try {
  for (const filePath of DB_FILES) {
    if (!fs.existsSync(filePath)) continue;
    fs.unlinkSync(filePath);
    console.log(`✓ Deleted ${path.basename(filePath)}`);
  }
} catch (error) {
  console.error("❌ Error deleting database files:", error);
  process.exit(1);
}

// Initialize database with fresh schema
try {
  initializeDb(encryptionKey, username);
  const seeded = seedDevData(getDb(encryptionKey));
  console.log("\n✓ Database reinitialized successfully!");
  console.log(`✓ Encryption key: ${encryptionKey.substring(0, 12)}...`);
  console.log(`✓ Username: ${username}`);
  console.log(
    `✓ Sample books: ${seeded.accounts} accounts, ${seeded.transactions} transactions, ${seeded.transfers} transfers, ${seeded.budgets} budgets`
  );
  console.log(`✓ Home currency: ${seeded.currency}`);
  console.log("\n⚠️  IMPORTANT: Use this same encryption key when unlocking the app!");
  console.log("   If you used ENCRYPTION_KEY env var, make sure it's set in your .env file.");
} catch (error) {
  console.error("❌ Error initializing database:", error);
  process.exit(1);
}
