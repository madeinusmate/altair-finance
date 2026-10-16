import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { payeeDraft } from "../lib/payees/assign";
import { bundledPayees } from "../lib/payees/bundle";
import { PAYEE_LOGO_PREFIX } from "../lib/payees/catalog";
import { normalizePayeeIconImage, PAYEE_ICON_EDGE_PX, PAYEE_ICON_MAX_BYTES, payeeIconImageSize } from "../lib/payees/icon-image";
import { PAYEE_BUNDLE_IMAGES } from "../lib/payees/images";
import { PAYEE_LOGOS } from "../lib/payees/logos";
import { cleanPayee } from "../lib/payees/normalize";
import { seedDefaultPayees } from "../lib/payees/seed";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

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

describe("payee bundle images", () => {
  it("keeps raster images out of the client catalog", () => {
    const catalog = readFileSync(new URL("../lib/payees/catalog.ts", import.meta.url), "utf8");
    assert.equal(catalog.includes("PAYEE_BUNDLE_IMAGES"), false);
    assert.equal(catalog.includes("data:image"), false);
  });

  it("validates every bundled image", () => {
    const entries = Object.entries(PAYEE_BUNDLE_IMAGES);
    assert.ok(entries.length >= 80);
    for (const [key, entry] of entries) {
      assert.equal(cleanPayee(entry.title)?.normalizedName, key, entry.title);
      assert.match(entry.domain, HOSTNAME, entry.title);
      assert.equal(normalizePayeeIconImage(entry.image), entry.image, entry.title);
      const size = payeeIconImageSize(entry.image);
      assert.equal(size?.width, PAYEE_ICON_EDGE_PX, entry.title);
      assert.equal(size?.height, PAYEE_ICON_EDGE_PX, entry.title);
      const bytes = Buffer.from(entry.image.slice(entry.image.indexOf(",") + 1), "base64");
      assert.ok(bytes.length <= PAYEE_ICON_MAX_BYTES, entry.title);
      assert.ok(bytes.length > 32, entry.title);
    }
  });

  it("merges logos, images, and the generic transit icon without duplicate names", () => {
    const payees = bundledPayees();
    const names = payees.map((payee) => payee.normalizedName);
    assert.equal(new Set(names).size, names.length);
    for (const logo of Object.values(PAYEE_LOGOS)) {
      const normalized = cleanPayee(logo.title)?.normalizedName;
      assert.ok(normalized);
      assert.ok(names.includes(normalized), logo.title);
    }
    const bus = payees.find((payee) => payee.normalizedName === "bus/mrt");
    assert.equal(bus?.icon, "Bus");
    assert.equal(bus?.image, null);
    for (const name of ["grab", "dbs", "citibank", "netflix"]) {
      const payee = payees.find((item) => item.normalizedName === name);
      assert.ok(payee?.image, name);
      assert.equal(normalizePayeeIconImage(payee?.image), payee?.image);
    }
  });

  it("does not replace an explicit icon with a bundled image", () => {
    const netflix = payeeDraft("NETFLIX", "Coffee");
    assert.equal(netflix?.icon, "Coffee");
    assert.equal(netflix?.image, null);
    const preset = payeeDraft("NETFLIX");
    assert.equal(preset?.icon, "logo:netflix");
    assert.equal(preset?.image, bundledPayees().find((payee) => payee.normalizedName === "netflix")?.image);
  });

  it("fills a missing image on upgrade and leaves custom icons and deleted brands alone", () => {
    const sqlite = createDb();
    const imagePayee = bundledPayees().find(
      (payee) => payee.image && payee.icon?.startsWith(PAYEE_LOGO_PREFIX) && payee.normalizedName !== "starbucks"
    );
    const added = bundledPayees().find((payee) => payee.image && !payee.icon);
    assert.ok(imagePayee);
    assert.ok(added);
    sqlite
      .prepare("INSERT INTO meta (id, schema_version, created_at) VALUES ('payee_defaults_v1', 1, 1)")
      .run();
    sqlite
      .prepare(
        `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
         VALUES ('logo', ?, ?, ?, NULL, 1, 1)`
      )
      .run(imagePayee.name, imagePayee.normalizedName, imagePayee.icon);
    sqlite
      .prepare(
        `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
         VALUES ('custom', 'STARBUCKS', 'starbucks', 'Coffee', NULL, 1, 1)`
      )
      .run();

    seedDefaultPayees(sqlite as never);

    const filled = sqlite.prepare("SELECT icon, icon_image FROM payees WHERE id = 'logo'").get() as {
      icon: string;
      icon_image: string | null;
    };
    const custom = sqlite.prepare("SELECT icon, icon_image FROM payees WHERE id = 'custom'").get() as {
      icon: string;
      icon_image: string | null;
    };
    const inserted = sqlite.prepare("SELECT icon, icon_image FROM payees WHERE normalized_name = ?").get(added.normalizedName) as {
      icon: string | null;
      icon_image: string | null;
    };
    const spotify = sqlite.prepare("SELECT id FROM payees WHERE normalized_name = 'spotify'").get();
    assert.equal(filled.icon, imagePayee.icon);
    assert.equal(filled.icon_image, imagePayee.image);
    assert.equal(custom.icon, "Coffee");
    assert.equal(custom.icon_image, null);
    assert.equal(inserted.icon, null);
    assert.equal(inserted.icon_image, added.image);
    assert.equal(spotify, undefined);

    sqlite.prepare("DELETE FROM payees WHERE normalized_name = ?").run(added.normalizedName);
    seedDefaultPayees(sqlite as never);
    const stayedDeleted = sqlite.prepare("SELECT id FROM payees WHERE normalized_name = ?").get(added.normalizedName);
    assert.equal(stayedDeleted, undefined);
    sqlite.close();
  });
});
