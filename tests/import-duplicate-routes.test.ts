import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { commitBalanceImport } from "../app/api/import/balances/route";
import { commitTransactionImport } from "../app/api/import/transactions/route";
import { POST as createTransaction, PUT as updateTransaction } from "../app/api/transactions/route";
import { clearConnectionCache, getDb, initializeDb, runMigrations, schema } from "../lib/db";
import { transactionFingerprint } from "../lib/import/fingerprint";

const KEY = "duplicate-import-test-key";

type Ledger = ReturnType<typeof getDb>;

const directories: string[] = [];

const openLedger = (): { dir: string; db: Ledger } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netly-dup-"));
  directories.push(dir);
  process.env.ELECTRON_USER_DATA = dir;
  clearConnectionCache();
  initializeDb(KEY, "Tester");
  return { dir, db: getDb(KEY) };
};

const sqliteClient = (db: Ledger) => (db as unknown as { $client: Parameters<typeof runMigrations>[0] }).$client;

const closeLedger = (db: Ledger) => {
  sqliteClient(db).close();
  clearConnectionCache();
};

after(() => {
  clearConnectionCache();
  for (const dir of directories) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const insertAccount = (
  db: Ledger,
  account: { id: string; name: string; type: "transaction" | "balance" | "investment" }
) => {
  const now = new Date();
  db.insert(schema.accounts)
    .values({
      id: account.id,
      name: account.name,
      type: account.type,
      nature: "asset",
      category: account.type === "transaction" ? "checking" : "savings",
      currency: "USD",
      initialBalance: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
};

const coffee = {
  type: "debit" as const,
  accountId: "checking",
  category: "Food & Drink",
  amount: 4.5,
  description: "Coffee",
  date: "2024-03-15",
};

const authedRequest = (url: string, method: string, body: unknown) =>
  new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-encryption-key": KEY,
    },
    body: JSON.stringify(body),
  });

describe("duplicate import routes", { concurrency: false }, () => {
  it("inserts nothing on a second post and reports skipped duplicates", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const first = await commitTransactionImport(db, { rows: [coffee] });
      const second = await commitTransactionImport(db, { rows: [coffee] });
      assert.equal(first.status, 200);
      assert.equal("transactions" in first.payload && first.payload.transactions, 1);
      assert.equal(second.status, 200);
      if (!("transactions" in second.payload)) {
        assert.fail(JSON.stringify(second.payload));
      }
      assert.equal(second.payload.transactions, 0);
      assert.equal(second.payload.skippedDuplicates, 1);
      assert.equal(db.select().from(schema.transactions).all().length, 1);
    } finally {
      closeLedger(db);
    }
  });

  it("inserts both when one of two identical new rows overrides, and skips a third", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const result = await commitTransactionImport(db, {
        rows: [coffee, { ...coffee, overrideDuplicate: true }, coffee],
      });
      assert.equal(result.status, 200);
      if (!("transactions" in result.payload)) {
        assert.fail(JSON.stringify(result.payload));
      }
      assert.equal(result.payload.transactions, 2);
      assert.equal(result.payload.skippedDuplicates, 1);
      assert.equal(db.select().from(schema.transactions).all().length, 2);
    } finally {
      closeLedger(db);
    }
  });

  it("inserts nothing when a later non-duplicate row has an invalid category", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const result = await commitTransactionImport(db, {
        filename: "jan.csv",
        fileHash: "hash-invalid",
        rows: [coffee, { ...coffee, description: "Tea", category: "Not A Category" }],
      });
      assert.equal(result.status, 400);
      assert.equal("error" in result.payload, true);
      assert.equal(db.select().from(schema.transactions).all().length, 0);
      assert.equal(db.select().from(schema.imports).all().length, 0);
    } finally {
      closeLedger(db);
    }
  });

  it("skips the same balance snapshot and inserts a different amount", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "savings", name: "Savings", type: "balance" });
      const first = await commitBalanceImport(db, {
        rows: [{ accountId: "savings", balance: 100, date: "2024-03-15" }],
      });
      const second = await commitBalanceImport(db, {
        rows: [
          { accountId: "savings", balance: 100, date: "2024-03-15" },
          { accountId: "savings", balance: 125, date: "2024-03-15" },
        ],
      });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      if (!("balances" in second.payload)) {
        assert.fail(JSON.stringify(second.payload));
      }
      assert.equal(second.payload.balances, 1);
      assert.equal(second.payload.skippedDuplicates, 1);
      const stored = db.select().from(schema.balanceHistory).all();
      assert.equal(stored.length, 2);
      assert.deepEqual(stored.map((row) => row.balance).sort((a, b) => a - b), [100, 125]);
    } finally {
      closeLedger(db);
    }
  });

  it("skips an import that matches a hand-entered transaction", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const created = await createTransaction(
        authedRequest("http://127.0.0.1/api/transactions", "POST", coffee)
      );
      assert.equal(created.status, 201);
      const imported = await commitTransactionImport(db, { rows: [coffee] });
      assert.equal(imported.status, 200);
      if (!("skippedDuplicates" in imported.payload)) {
        assert.fail(JSON.stringify(imported.payload));
      }
      assert.equal(imported.payload.transactions, 0);
      assert.equal(imported.payload.skippedDuplicates, 1);
      const stored = db.select().from(schema.transactions).all();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].sourceFingerprint, null);
      assert.ok(stored[0].fingerprint);
    } finally {
      closeLedger(db);
    }
  });

  it("still skips the original description after that description is edited", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const imported = await commitTransactionImport(db, { rows: [coffee] });
      assert.equal(imported.status, 200);
      const original = db.select().from(schema.transactions).all()[0];
      assert.equal(original.fingerprint, original.sourceFingerprint);
      const updated = await updateTransaction(
        authedRequest("http://127.0.0.1/api/transactions", "PUT", {
          id: original.id,
          type: "debit",
          category: "Food & Drink",
          amount: 4.5,
          description: "Tea",
          date: "2024-03-15",
        })
      );
      assert.equal(updated.status, 200);
      const afterEdit = db.select().from(schema.transactions).all()[0];
      assert.equal(afterEdit.sourceFingerprint, original.sourceFingerprint);
      assert.notEqual(afterEdit.fingerprint, original.fingerprint);
      const again = await commitTransactionImport(db, { rows: [coffee] });
      assert.equal(again.status, 200);
      if (!("skippedDuplicates" in again.payload)) {
        assert.fail(JSON.stringify(again.payload));
      }
      assert.equal(again.payload.transactions, 0);
      assert.equal(again.payload.skippedDuplicates, 1);
      assert.equal(db.select().from(schema.transactions).all().length, 1);
    } finally {
      closeLedger(db);
    }
  });

  it("inserts a new row from a previously imported file and reports the file hash", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const first = await commitTransactionImport(db, {
        filename: "jan.csv",
        fileHash: "hash-1",
        rows: [coffee],
      });
      assert.equal(first.status, 200);
      if (!("isDuplicate" in first.payload)) {
        assert.fail(JSON.stringify(first.payload));
      }
      assert.equal(first.payload.isDuplicate, false);
      const second = await commitTransactionImport(db, {
        filename: "jan.csv",
        fileHash: "hash-1",
        rows: [coffee, { ...coffee, description: "Tea", amount: 3 }],
      });
      assert.equal(second.status, 200);
      if (!("isDuplicate" in second.payload)) {
        assert.fail(JSON.stringify(second.payload));
      }
      assert.equal(second.payload.isDuplicate, true);
      assert.equal(second.payload.transactions, 1);
      assert.equal(second.payload.skippedDuplicates, 1);
      assert.equal(db.select().from(schema.transactions).all().length, 2);
    } finally {
      closeLedger(db);
    }
  });

  it("backfills fingerprint and source fingerprint from the current row fields", async () => {
    const { db } = openLedger();
    try {
      insertAccount(db, { id: "checking", name: "Checking", type: "transaction" });
      const now = new Date();
      db.insert(schema.transactions)
        .values({
          id: "tx-old",
          accountId: "checking",
          type: "debit",
          category: "Food & Drink",
          amount: 10.004,
          description: "  Cafe   Latte ",
          date: new Date("2024-06-01"),
          createdAt: now,
          fingerprint: null,
          sourceFingerprint: null,
        })
        .run();
      runMigrations(sqliteClient(db));
      const row = db.select().from(schema.transactions).all()[0];
      const expected = await transactionFingerprint({
        accountId: "checking",
        date: "2024-06-01",
        amount: 10.004,
        description: "  Cafe   Latte ",
        type: "debit",
      });
      assert.equal(row.fingerprint, expected);
      assert.equal(row.sourceFingerprint, expected);
    } finally {
      closeLedger(db);
    }
  });
});
