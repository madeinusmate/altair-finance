import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { format, startOfMonth, subMonths } from "date-fns";
import { eq } from "drizzle-orm";
import { seedDevData } from "../scripts/dev-data";
import { clearConnectionCache, getDb, initializeDb, schema } from "../lib/db";

const KEY = "dev-data-test-key-12345";
const NOW = new Date(2026, 9, 16, 15, 0, 0, 0);

const directories: string[] = [];
const previousUserData = process.env.ELECTRON_USER_DATA;

after(() => {
  if (previousUserData === undefined) delete process.env.ELECTRON_USER_DATA;
  else process.env.ELECTRON_USER_DATA = previousUserData;
  clearConnectionCache();
  for (const dir of directories) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("dev sample books", () => {
  it("fills the last three months with accounts, spending, and budgets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altair-dev-data-"));
    directories.push(dir);
    process.env.ELECTRON_USER_DATA = dir;
    clearConnectionCache();
    initializeDb(KEY, "Alex Rivera");
    const db = getDb(KEY);

    try {
      const seeded = seedDevData(db, NOW);
      assert.equal(seeded.accounts, 5);
      assert.equal(seeded.budgets, 21);
      assert.ok(seeded.transactions > 20);
      assert.ok(seeded.transfers >= 4);

      const windowStart = startOfMonth(subMonths(NOW, 2));
      const transactions = db.select().from(schema.transactions).all();
      assert.equal(transactions.length, seeded.transactions);
      for (const row of transactions) {
        assert.ok(row.date.getTime() >= windowStart.getTime());
        assert.ok(row.date.getTime() <= NOW.getTime());
        assert.ok(row.categoryId);
        assert.ok(row.payeeId);
      }

      const months = [2, 1, 0].map((offset) => format(startOfMonth(subMonths(NOW, offset)), "yyyy-MM"));
      const budgets = db.select().from(schema.budgets).all();
      assert.deepEqual(
        [...new Set(budgets.map((budget) => budget.yearMonth))].sort(),
        [...months].sort()
      );
      const food = budgets.filter((budget) => budget.categoryName === "Food & Drink");
      assert.equal(food.length, 3);
      assert.ok(food.every((budget) => budget.amount === 450 && budget.currency === "SGD"));

      const profile = db.select().from(schema.userSettings).where(eq(schema.userSettings.id, "user")).get();
      assert.equal(profile?.email, "alex.rivera@example.com");
      assert.equal(profile?.preferredCurrency, "SGD");
      assert.equal(profile?.username, "Alex Rivera");

      const cardPayments = db
        .select()
        .from(schema.transfers)
        .all()
        .filter((transfer) => transfer.description === "Card payment");
      assert.equal(cardPayments.length, 2);
      assert.ok(cardPayments.every((transfer) => transfer.date.getMonth() !== NOW.getMonth()));
    } finally {
      db.$client.close();
      clearConnectionCache();
    }
  });
});
