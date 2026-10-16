import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { payeeDraft } from "../lib/payees/assign";
import { catalogPayee, defaultPayees } from "../lib/payees/catalog";
import { cleanPayee } from "../lib/payees/normalize";
import { seedDefaultPayees } from "../lib/payees/seed";

const createDb = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE meta (
      id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE payees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      icon TEXT,
      icon_image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return sqlite;
};

describe("default payees", () => {
  it("uses one standardized name per payee", () => {
    const names = defaultPayees().map((payee) => payee.normalizedName);
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.length >= 80);
  });

  it("matches a statement line to the bundled payee", () => {
    const cleaned = cleanPayee("STARBUCKS #1234");
    assert.ok(cleaned);
    const preset = catalogPayee(cleaned.normalizedName);
    assert.equal(preset?.name, "Starbucks");
    assert.equal(preset?.icon, "logo:starbucks");
    assert.equal(catalogPayee("uber eats")?.name, "Uber Eats");
    assert.equal(catalogPayee("mcdonald's")?.name, "McDonald's");
    assert.equal(catalogPayee("netflix")?.name, "Netflix");
  });

  it("stores the standardized name when a statement matches the bundle", () => {
    const draft = payeeDraft("UBER EATS 99");
    assert.equal(draft?.name, "Uber Eats");
    assert.equal(draft?.normalizedName, "uber eats");
    assert.equal(draft?.icon, "logo:ubereats");
    assert.equal(payeeDraft("Corner Cafe")?.name, "Corner Cafe");
    assert.equal(payeeDraft("Corner Cafe")?.icon, null);
    assert.equal(payeeDraft("NETFLIX", "Coffee")?.icon, "Coffee");
  });

  it("seeds the bundle once and keeps a custom icon", () => {
    const sqlite = createDb();
    sqlite
      .prepare(
        `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
         VALUES ('custom', 'STARBUCKS', 'starbucks', 'Coffee', NULL, 1, 1)`
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
         VALUES ('plain', 'NETFLIX', 'netflix', NULL, NULL, 1, 1)`
      )
      .run();

    seedDefaultPayees(sqlite as never);
    const starbucks = sqlite.prepare("SELECT name, icon FROM payees WHERE id = 'custom'").get() as {
      name: string;
      icon: string;
    };
    const netflix = sqlite.prepare("SELECT name, icon FROM payees WHERE id = 'plain'").get() as {
      name: string;
      icon: string;
    };
    assert.equal(starbucks.name, "STARBUCKS");
    assert.equal(starbucks.icon, "Coffee");
    assert.equal(netflix.name, "NETFLIX");
    assert.equal(netflix.icon, "logo:netflix");

    const count = sqlite.prepare("SELECT COUNT(*) AS count FROM payees").get() as { count: number };
    seedDefaultPayees(sqlite as never);
    sqlite.prepare("DELETE FROM payees WHERE normalized_name = 'spotify'").run();
    seedDefaultPayees(sqlite as never);
    const after = sqlite.prepare("SELECT COUNT(*) AS count FROM payees").get() as { count: number };
    const spotify = sqlite.prepare("SELECT id FROM payees WHERE normalized_name = 'spotify'").get();
    assert.equal(after.count, count.count - 1);
    assert.equal(spotify, undefined);
    sqlite.close();
  });
});
