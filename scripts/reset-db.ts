#!/usr/bin/env tsx

import { initializeDb } from "../lib/db/index";
import * as fs from "fs";
import * as path from "path";

const DB_PATH = path.join(process.cwd(), "data", "netly.db");

// Get encryption key from environment or argument, or use default
const encryptionKey = process.env.ENCRYPTION_KEY || process.argv[2] || "reset-key-min-8-chars-12345";
// Get username from environment or argument, or use default
const username = process.env.USERNAME || process.argv[3] || "admin";

if (encryptionKey.length < 8) {
  console.error("Error: Encryption key must be at least 8 characters long");
  console.error("Usage: pnpm reset-db [encryption-key]");
  console.error("   or: ENCRYPTION_KEY=your-key pnpm reset-db");
  process.exit(1);
}

console.log("🗑️  Resetting database...\n");

// Delete existing database files
try {
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log("✓ Deleted existing database file");
  }
  
  // Also delete WAL and SHM files if they exist
  const walPath = `${DB_PATH}-wal`;
  const shmPath = `${DB_PATH}-shm`;
  
  if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
    console.log("✓ Deleted WAL file");
  }
  
  if (fs.existsSync(shmPath)) {
    fs.unlinkSync(shmPath);
    console.log("✓ Deleted SHM file");
  }
} catch (error) {
  console.error("❌ Error deleting database files:", error);
  process.exit(1);
}

// Initialize database with fresh schema
try {
  initializeDb(encryptionKey, username);
  console.log("\n✓ Database reinitialized successfully!");
  console.log(`✓ Encryption key: ${encryptionKey.substring(0, 12)}...`);
  console.log(`✓ Username: ${username}`);
  console.log("\n⚠️  IMPORTANT: Use this same encryption key when unlocking the app!");
  console.log("   If you used ENCRYPTION_KEY env var, make sure it's set in your .env file.");
} catch (error) {
  console.error("❌ Error initializing database:", error);
  process.exit(1);
}
