import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { inferCatalogType } from "../lib/db/category-identity";
import { ensureCategoryIds, type CategoryMigrationDb } from "../lib/db/category-ids";

const asMigrationDb = (db: Database.Database): CategoryMigrationDb => db as unknown as CategoryMigrationDb;

const createCatalog = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE transaction_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      transaction_type TEXT,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
};

const createLedger = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      description TEXT,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE transfers (
      id TEXT PRIMARY KEY,
      from_account_id TEXT NOT NULL,
      to_account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      from_amount REAL NOT NULL,
      to_amount REAL NOT NULL,
      category TEXT,
      description TEXT,
      date INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE budgets (
      id TEXT PRIMARY KEY,
      category_name TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
};

const insertCategory = (
  db: Database.Database,
  name: string,
  transactionType: "debit" | "credit" | null
) => {
  const result = db
    .prepare(
      "INSERT INTO transaction_categories (name, transaction_type, created_at, updated_at) VALUES (?, ?, 1, 1)"
    )
    .run(name, transactionType);
  return Number(result.lastInsertRowid);
};

describe("inferCatalogType", () => {
  it("returns debit when every transaction is debit", () => {
    assert.equal(inferCatalogType(["debit", "debit"]), "debit");
  });

  it("returns credit when every transaction is credit", () => {
    assert.equal(inferCatalogType(["credit"]), "credit");
  });

  it("returns null for mixed history", () => {
    assert.equal(inferCatalogType(["debit", "credit"]), null);
  });

  it("returns null for an empty list", () => {
    assert.equal(inferCatalogType([]), null);
  });
});

describe("ensureCategoryIds", () => {
  it("returns when the transactions table does not exist yet", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE budgets (id TEXT PRIMARY KEY, category_name TEXT)");
    ensureCategoryIds(asMigrationDb(db));
    const columns = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>;
    assert.equal(columns.some((column) => column.name === "category_id"), false);
    db.close();
  });

  it("backfills ids without rewriting leftover labels", () => {
    const db = new Database(":memory:");
    createCatalog(db);
    createLedger(db);
    db.prepare("INSERT INTO accounts (id) VALUES (?)").run("acct");
    const groceriesId = insertCategory(db, "Groceries", "debit");
    const salaryId = insertCategory(db, "Salary", "credit");
    const transferId = insertCategory(db, "Transfer", null);

    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-groceries", "acct", "debit", "Groceries", 12, 1, 1);
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-cafe", "acct", "debit", "Cafe", 4, 1, 1);
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-shared-debit", "acct", "debit", "Shared", 1, 1, 1);
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-shared-credit", "acct", "credit", "Shared", 2, 1, 1);
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-food", "acct", "debit", "food", 3, 1, 1);
    insertCategory(db, "Food", "debit");

    db.prepare(
      `INSERT INTO transfers (id, from_account_id, to_account_id, amount, from_amount, to_amount, category, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("tr-named", "acct", "acct", 5, 5, 5, "Transfer", 1, 1);
    db.prepare(
      `INSERT INTO transfers (id, from_account_id, to_account_id, amount, from_amount, to_amount, category, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("tr-null", "acct", "acct", 6, 6, 6, null, 1, 1);
    db.prepare(
      `INSERT INTO transfers (id, from_account_id, to_account_id, amount, from_amount, to_amount, category, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("tr-moving", "acct", "acct", 7, 7, 7, "Moving", 1, 1);

    db.prepare(
      "INSERT INTO budgets (id, category_name, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("budget-a", "Groceries", 100, "USD", 1, 1);
    db.prepare(
      "INSERT INTO budgets (id, category_name, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("budget-b", "Groceries", 40, "USD", 1, 1);
    db.prepare(
      "INSERT INTO budgets (id, category_name, amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("budget-rent", "Rent", 900, "USD", 1, 1);

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-orphan-account", "missing-account", "debit", "Groceries", 8, 1, 1);
    db.exec("PRAGMA foreign_keys = ON");

    try {
      ensureCategoryIds(asMigrationDb(db));
      ensureCategoryIds(asMigrationDb(db));
    } finally {
      console.warn = originalWarn;
    }

    const groceries = db.prepare("SELECT category, category_id FROM transactions WHERE id = ?").get("tx-groceries") as {
      category: string;
      category_id: number;
    };
    assert.equal(groceries.category, "Groceries");
    assert.equal(groceries.category_id, groceriesId);

    const cafe = db.prepare("SELECT id, transaction_type FROM transaction_categories WHERE name = ?").get("Cafe") as {
      id: number;
      transaction_type: string | null;
    };
    assert.equal(cafe.transaction_type, "debit");
    const cafeTx = db.prepare("SELECT category, category_id FROM transactions WHERE id = ?").get("tx-cafe") as {
      category: string;
      category_id: number;
    };
    assert.equal(cafeTx.category, "Cafe");
    assert.equal(cafeTx.category_id, cafe.id);

    const shared = db
      .prepare("SELECT transaction_type FROM transaction_categories WHERE name = ?")
      .get("Shared") as { transaction_type: string | null };
    assert.equal(shared.transaction_type, null);

    const moving = db
      .prepare("SELECT transaction_type FROM transaction_categories WHERE name = ?")
      .get("Moving") as { transaction_type: string | null };
    assert.equal(moving.transaction_type, null);

    const rent = db
      .prepare("SELECT transaction_type FROM transaction_categories WHERE name = ?")
      .get("Rent") as { transaction_type: string | null };
    assert.equal(rent.transaction_type, null);

    const nullTransfer = db.prepare("SELECT category, category_id FROM transfers WHERE id = ?").get("tr-null") as {
      category: string | null;
      category_id: number;
    };
    assert.equal(nullTransfer.category, null);
    assert.equal(nullTransfer.category_id, transferId);

    const namedTransfer = db.prepare("SELECT category_id FROM transfers WHERE id = ?").get("tr-named") as {
      category_id: number;
    };
    assert.equal(namedTransfer.category_id, transferId);

    const salaryUnused = db.prepare("SELECT id FROM transaction_categories WHERE name = ?").get("Salary") as { id: number };
    assert.equal(salaryUnused.id, salaryId);

    const budgets = db.prepare("SELECT id, category_name, category_id FROM budgets ORDER BY id").all() as Array<{
      id: string;
      category_name: string;
      category_id: number;
    }>;
    assert.equal(budgets.length, 3);
    assert.equal(budgets[0].category_name, "Groceries");
    assert.equal(budgets[1].category_name, "Groceries");
    assert.equal(budgets[0].category_id, groceriesId);
    assert.equal(budgets[1].category_id, groceriesId);

    const foodRows = db.prepare("SELECT name FROM transaction_categories WHERE name IN ('Food', 'food') ORDER BY name").all() as Array<{
      name: string;
    }>;
    assert.deepEqual(
      foodRows.map((row) => row.name),
      ["Food", "food"]
    );

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%_category_id' ORDER BY name")
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      indexes.map((row) => row.name),
      ["idx_budgets_category_id", "idx_transactions_category_id", "idx_transfers_category_id"]
    );

    assert.equal(
      warnings.some((warning) => warning.includes("parent=accounts")),
      true
    );

    const beforeRename = db.prepare("SELECT COUNT(*) AS count FROM transaction_categories").get() as { count: number };
    db.prepare("UPDATE transaction_categories SET name = ? WHERE id = ?").run("Market", groceriesId);
    ensureCategoryIds(asMigrationDb(db));
    const afterRename = db.prepare("SELECT COUNT(*) AS count FROM transaction_categories").get() as { count: number };
    assert.equal(afterRename.count, beforeRename.count);
    const stillLabeled = db.prepare("SELECT category, category_id FROM transactions WHERE id = ?").get("tx-groceries") as {
      category: string;
      category_id: number;
    };
    assert.equal(stillLabeled.category, "Groceries");
    assert.equal(stillLabeled.category_id, groceriesId);
    const ghost = db.prepare("SELECT id FROM transaction_categories WHERE name = ?").get("Groceries");
    assert.equal(ghost, undefined);

    db.close();
  });

  it("throws when a transaction still has no category after backfill", () => {
    const db = new Database(":memory:");
    createCatalog(db);
    createLedger(db);
    db.prepare("INSERT INTO accounts (id) VALUES (?)").run("acct");
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-blank", "acct", "debit", null, 1, 1, 1);

    assert.throws(
      () => ensureCategoryIds(asMigrationDb(db)),
      /Category migration left transactions without category_id/
    );
    db.close();
  });

  it("throws when category_id does not point at a catalog row", () => {
    const db = new Database(":memory:");
    createCatalog(db);
    createLedger(db);
    db.prepare("INSERT INTO accounts (id) VALUES (?)").run("acct");
    const groceriesId = insertCategory(db, "Groceries", "debit");
    db.prepare(
      "INSERT INTO transactions (id, account_id, type, category, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("tx-groceries", "acct", "debit", "Groceries", 12, 1, 1);
    ensureCategoryIds(asMigrationDb(db));
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare("UPDATE transactions SET category_id = ? WHERE id = ?").run(999, "tx-groceries");
    db.exec("PRAGMA foreign_keys = ON");

    assert.throws(() => ensureCategoryIds(asMigrationDb(db)), /Category migration/);
    const row = db.prepare("SELECT category_id FROM transactions WHERE id = ?").get("tx-groceries") as {
      category_id: number;
    };
    assert.notEqual(row.category_id, groceriesId);
    db.close();
  });
});
