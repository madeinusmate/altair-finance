import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3-multiple-ciphers";
import { NextRequest } from "next/server";
import { POST } from "../app/api/accounts/route";
import {
  SCHEMA_VERSION,
  clearConnectionCache,
  getDb,
  initializeDb,
  runMigrations,
} from "../lib/db/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Sqlite = InstanceType<typeof Database>;
type CountRow = { count: number };
type MetadataRow = { metadata: string | null };
type InstallRow = { install_id: string | null };

const applyCipherPragmas = (sqlite: Sqlite, encryptionKey: string): void => {
  sqlite.pragma("cipher = 'sqlcipher'");
  sqlite.pragma("legacy = 4");
  sqlite.pragma(`key = '${encryptionKey.replaceAll("'", "''")}'`);
  sqlite.pragma("journal_mode = WAL");
};

const openEncrypted = (dbPath: string, encryptionKey: string): Sqlite => {
  const sqlite = new Database(dbPath);
  applyCipherPragmas(sqlite, encryptionKey);
  return sqlite;
};

const tokenTableNames = (sqlite: Sqlite): string[] => {
  const rows = sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('open_banking_tokens', 'open_banking_client_tokens')
       ORDER BY name`
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
};

const withTempDataDir = async (run: (dir: string) => Promise<void> | void): Promise<void> => {
  const previous = process.env.ELECTRON_USER_DATA;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netly-remove-bank-sync-"));
  process.env.ELECTRON_USER_DATA = dir;
  clearConnectionCache();
  try {
    await run(dir);
  } finally {
    clearConnectionCache();
    if (previous === undefined) {
      delete process.env.ELECTRON_USER_DATA;
    } else {
      process.env.ELECTRON_USER_DATA = previous;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const createLegacyDatabase = (dbPath: string, encryptionKey: string): void => {
  const sqlite = openEncrypted(dbPath, encryptionKey);
  sqlite.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      nature TEXT NOT NULL,
      category TEXT NOT NULL,
      currency TEXT NOT NULL,
      initial_balance REAL NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE transfers (
      id TEXT PRIMARY KEY,
      from_account_id TEXT NOT NULL,
      to_account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      from_amount REAL,
      to_amount REAL,
      exchange_rate REAL,
      category TEXT NOT NULL DEFAULT 'Transfer',
      description TEXT,
      date INTEGER NOT NULL
    );
    CREATE TABLE user_settings (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      install_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE meta (
      id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE open_banking_client_tokens (
      id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE open_banking_tokens (
      login_identity_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      connected_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO accounts (
      id, name, type, nature, category, currency, initial_balance, metadata, created_at, updated_at
    ) VALUES (
      'acct-1', 'Linked checking', 'transaction', 'asset', 'checking', 'USD', 25, '{"provider":"old"}', 1, 1
    );
    INSERT INTO transactions (
      id, account_id, type, category, amount, description, date, metadata, created_at
    ) VALUES (
      'tx-1', 'acct-1', 'debit', 'Food & Drink', 4.5, 'Coffee', 1, '{"providerTransaction":"old"}', 1
    );
    INSERT INTO user_settings (id, username, install_id, created_at, updated_at)
    VALUES ('user', 'Old', 'kept-install', 1, 1);
    INSERT INTO meta (id, schema_version, created_at) VALUES ('primary', 1, 1);
    INSERT INTO open_banking_client_tokens (id, access_token, expires_at, created_at)
    VALUES ('client_credentials', 'test-access', 1, 1);
    INSERT INTO open_banking_tokens (
      login_identity_id, access_token, refresh_token, connected_at, updated_at
    ) VALUES ('login-1', 'test-access', 'test-refresh', 1, 1);
  `);
  sqlite.close();
};

const assertBooksUnchanged = (sqlite: Sqlite): void => {
  assert.deepEqual(tokenTableNames(sqlite), []);
  const accounts = sqlite.prepare("SELECT COUNT(*) AS count FROM accounts").get() as CountRow;
  const transactions = sqlite.prepare("SELECT COUNT(*) AS count FROM transactions").get() as CountRow;
  const account = sqlite.prepare("SELECT metadata FROM accounts WHERE id = 'acct-1'").get() as MetadataRow;
  const transaction = sqlite
    .prepare("SELECT metadata FROM transactions WHERE id = 'tx-1'")
    .get() as MetadataRow;
  const install = sqlite
    .prepare("SELECT install_id FROM user_settings WHERE id = 'user'")
    .get() as InstallRow;
  assert.equal(accounts.count, 1);
  assert.equal(transactions.count, 1);
  assert.equal(account.metadata, '{"provider":"old"}');
  assert.equal(transaction.metadata, '{"providerTransaction":"old"}');
  assert.equal(install.install_id, "kept-install");
};

const walkFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};

describe("remove bank sync", { concurrency: 1 }, () => {
  it("keeps schema version at 1", () => {
    assert.equal(SCHEMA_VERSION, 1);
  });

  it("drops token tables when an existing database is opened and leaves books in place", async () => {
    await withTempDataDir(async (dir) => {
      const encryptionKey = "existing-open-key";
      const dbPath = path.join(dir, "netly.db");
      createLegacyDatabase(dbPath, encryptionKey);

      const db = getDb(encryptionKey);
      try {
        assertBooksUnchanged(db.$client as Sqlite);
      } finally {
        (db.$client as Sqlite).close();
      }
    });
  });

  it("drops token tables during initializeDb without rewriting accounts or install_id", async () => {
    await withTempDataDir(async (dir) => {
      const encryptionKey = "existing-init-key";
      createLegacyDatabase(path.join(dir, "netly.db"), encryptionKey);

      initializeDb(encryptionKey, "Ada");

      const sqlite = openEncrypted(path.join(dir, "netly.db"), encryptionKey);
      try {
        assertBooksUnchanged(sqlite);
      } finally {
        sqlite.close();
      }
    });
  });

  it("drops token tables even when the transfers table is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netly-remove-bank-sync-"));
    const sqlite = openEncrypted(path.join(dir, "partial.db"), "partial-open-key");
    try {
      sqlite.exec(`
        CREATE TABLE open_banking_tokens (
          login_identity_id TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          connected_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE open_banking_client_tokens (
          id TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        INSERT INTO open_banking_tokens (
          login_identity_id, access_token, refresh_token, connected_at, updated_at
        ) VALUES ('login-1', 'test-access', 'test-refresh', 1, 1);
        INSERT INTO open_banking_client_tokens (id, access_token, expires_at, created_at)
        VALUES ('client_credentials', 'test-access', 1, 1);
      `);

      runMigrations(sqlite);

      assert.deepEqual(tokenTableNames(sqlite), []);
    } finally {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves install_id null on a fresh database and does not create token tables", async () => {
    await withTempDataDir(async (dir) => {
      const encryptionKey = "fresh-database-key";
      initializeDb(encryptionKey, "Ada");
      const db = getDb(encryptionKey);
      try {
        const sqlite = db.$client as Sqlite;
        assert.deepEqual(tokenTableNames(sqlite), []);
        const install = sqlite
          .prepare("SELECT install_id FROM user_settings WHERE id = 'user'")
          .get() as InstallRow;
        assert.equal(install.install_id, null);
        const meta = sqlite
          .prepare("SELECT schema_version AS schemaVersion FROM meta WHERE id = 'primary'")
          .get() as { schemaVersion: number };
        assert.equal(meta.schemaVersion, 1);
      } finally {
        (db.$client as Sqlite).close();
      }
      assert.equal(fs.existsSync(path.join(dir, "netly.db")), true);
    });
  });

  it("does not backfill install_id when an old settings row has no such column", async () => {
    await withTempDataDir(async (dir) => {
      const encryptionKey = "old-settings-key";
      const sqlite = openEncrypted(path.join(dir, "netly.db"), encryptionKey);
      sqlite.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          nature TEXT NOT NULL,
          category TEXT NOT NULL,
          currency TEXT NOT NULL,
          initial_balance REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE user_settings (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO accounts (
          id, name, type, nature, category, currency, initial_balance, created_at, updated_at
        ) VALUES (
          'acct-1', 'Cash', 'balance', 'asset', 'cash', 'USD', 10, 1, 1
        );
        INSERT INTO user_settings (id, username, created_at, updated_at)
        VALUES ('user', 'Old', 1, 1);
      `);
      sqlite.close();

      initializeDb(encryptionKey, "Ada");

      const opened = openEncrypted(path.join(dir, "netly.db"), encryptionKey);
      try {
        assert.deepEqual(tokenTableNames(opened), []);
        const install = opened
          .prepare("SELECT install_id FROM user_settings WHERE id = 'user'")
          .get() as InstallRow;
        const accounts = opened.prepare("SELECT COUNT(*) AS count FROM accounts").get() as CountRow;
        assert.equal(install.install_id, null);
        assert.equal(accounts.count, 1);
      } finally {
        opened.close();
      }
    });
  });

  it("stores null when POST /api/accounts includes metadata", async () => {
    await withTempDataDir(async (dir) => {
      const encryptionKey = "account-post-key";
      initializeDb(encryptionKey, "Ada");

      const seeded = openEncrypted(path.join(dir, "netly.db"), encryptionKey);
      seeded
        .prepare(
          `INSERT INTO accounts (
             id, name, type, nature, category, currency, initial_balance, metadata, created_at, updated_at
           ) VALUES (?, ?, 'transaction', 'asset', 'checking', 'USD', 0, ?, 1, 1)`
        )
        .run("acct-old", "Already linked", '{"provider":"old"}');
      seeded
        .prepare(
          `INSERT INTO transactions (
             id, account_id, type, category, amount, description, date, metadata, created_at
           ) VALUES (?, 'acct-old', 'debit', 'Food & Drink', 3, 'Tea', 1, ?, 1)`
        )
        .run("tx-old", '{"providerTransaction":"old"}');
      seeded.close();
      clearConnectionCache();

      const request = new NextRequest("http://127.0.0.1:8527/api/accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-encryption-key": encryptionKey,
        },
        body: JSON.stringify({
          name: "Wallet",
          type: "transaction",
          nature: "asset",
          category: "checking",
          currency: "USD",
          initialBalance: 0,
          metadata: { providerAccountId: "do-not-store" },
        }),
      });
      const response = await POST(request);
      const payload = (await response.json()) as { id?: string; metadata?: unknown; error?: string };
      assert.equal(response.status, 201, JSON.stringify(payload));
      assert.equal(payload.metadata, null);

      const sqlite = openEncrypted(path.join(dir, "netly.db"), encryptionKey);
      try {
        const created = sqlite
          .prepare("SELECT metadata FROM accounts WHERE name = 'Wallet'")
          .get() as MetadataRow;
        const previous = sqlite
          .prepare("SELECT metadata FROM accounts WHERE id = 'acct-old'")
          .get() as MetadataRow;
        const transaction = sqlite
          .prepare("SELECT metadata FROM transactions WHERE id = 'tx-old'")
          .get() as MetadataRow;
        const accounts = sqlite.prepare("SELECT COUNT(*) AS count FROM accounts").get() as CountRow;
        assert.equal(created.metadata, null);
        assert.equal(previous.metadata, '{"provider":"old"}');
        assert.equal(transaction.metadata, '{"providerTransaction":"old"}');
        assert.equal(accounts.count, 2);
      } finally {
        sqlite.close();
      }
    });
  });

  it("does not keep a connect page, provider client, or token-table create path", () => {
    assert.equal(fs.existsSync(path.join(root, "app/(app)/accounts/connect/page.tsx")), false);
    assert.equal(fs.existsSync(path.join(root, "app/api/open-banking")), false);
    assert.equal(fs.existsSync(path.join(root, "components/open-banking")), false);
    assert.equal(fs.existsSync(path.join(root, "public/plaid-link.html")), false);

    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(packageJson.dependencies?.["react-plaid-link"], undefined);
    assert.equal(packageJson.devDependencies?.["react-plaid-link"], undefined);

    const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    assert.equal(envExample.includes("FINVERSE_"), false);
    assert.equal(envExample.includes("PLAID_"), false);

    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /Accounts are created by hand/);
    assert.match(readme, /Transactions come from entry, CSV, PDF, or a database backup/);
    assert.equal(readme.includes("open-banking.md"), false);
    assert.equal(readme.includes("bring that integration back"), false);

    const doc = fs.readFileSync(path.join(root, "docs/open-banking.md"), "utf8");
    assert.match(doc, /Bank connect is not part of Netly/);
    assert.match(doc, /no supported way to turn Finverse or Plaid back on/);
    assert.equal(doc.includes("oauth-relay"), false);
    assert.equal(doc.includes("git revert"), false);
    assert.equal(doc.includes("eb73630"), false);
    assert.equal(doc.includes("5ba28fb"), false);
    assert.equal(doc.includes("react-plaid-link"), false);
    assert.equal(doc.includes("accounts/connect"), false);

    const indexSource = fs.readFileSync(path.join(root, "lib/db/index.ts"), "utf8");
    const openBankingLines = indexSource.split("\n").filter((line) => line.includes("open_banking"));
    assert.ok(openBankingLines.length > 0);
    for (const line of openBankingLines) {
      assert.match(line, /DROP TABLE IF EXISTS open_banking_(tokens|client_tokens);/);
    }
    assert.equal(indexSource.includes("randomUUID"), false);
    assert.equal(indexSource.includes("SET install_id"), false);

    const schemaSource = fs.readFileSync(path.join(root, "lib/db/schema.ts"), "utf8");
    assert.equal(schemaSource.includes("open_banking"), false);
    assert.equal(schemaSource.includes("openBanking"), false);
    assert.equal(schemaSource.includes("OpenBanking"), false);
    assert.match(schemaSource, /install_id/);

    const importSource = fs.readFileSync(path.join(root, "app/api/app/import/route.ts"), "utf8");
    assert.match(importSource, /runMigrations\(/);
    assert.equal(importSource.includes("open_banking"), false);

    const importUtils = fs.readFileSync(path.join(root, "lib/db/import-utils.ts"), "utf8");
    assert.equal(importUtils.includes("open_banking"), false);

    const codeRoots = ["app", "components", "lib", "electron", "public"].map((dir) => path.join(root, dir));
    const offenders: string[] = [];
    for (const dir of codeRoots) {
      for (const filePath of walkFiles(dir)) {
        const text = fs.readFileSync(filePath, "utf8");
        if (/react-plaid-link|api\.prod\.finverse\.net|finverse|plaid|oauth-relay|accounts\/connect/i.test(text)) {
          offenders.push(path.relative(root, filePath));
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
