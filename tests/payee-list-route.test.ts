import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/payees/route";
import { getOwnerPassphrase, setOwnerPassphrase } from "../lib/books-owner";
import { clearConnectionCache, getDb, initializeDb } from "../lib/db";

const KEY = "payee-list-route-test-key";

const directories: string[] = [];
const previousOwner = getOwnerPassphrase();
const previousUserData = process.env.ELECTRON_USER_DATA;

const openLedger = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altair-payees-"));
  directories.push(dir);
  process.env.ELECTRON_USER_DATA = dir;
  setOwnerPassphrase(null);
  clearConnectionCache();
  initializeDb(KEY, "Tester");
  return getDb(KEY);
};

const authed = (query: string) =>
  new NextRequest(`http://localhost/api/payees${query}`, {
    headers: { "x-encryption-key": KEY },
  });

after(() => {
  setOwnerPassphrase(previousOwner);
  if (previousUserData === undefined) delete process.env.ELECTRON_USER_DATA;
  else process.env.ELECTRON_USER_DATA = previousUserData;
  clearConnectionCache();
  for (const dir of directories) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("payee list route", { concurrency: false }, () => {
  it("returns one page of payees and a name-only summary", async () => {
    const db = openLedger();
    try {
      const pageResponse = await GET(authed("?limit=2&offset=0"));
      assert.equal(pageResponse.status, 200);
      const page = await pageResponse.json();
      assert.equal(page.payees.length, 2);
      assert.equal(page.limit, 2);
      assert.equal(page.offset, 0);
      assert.equal(page.hasMore, true);
      assert.ok(page.total > 2);
      assert.equal(typeof page.payees[0].iconImage, "string");

      const nextResponse = await GET(authed("?limit=2&offset=2"));
      const next = await nextResponse.json();
      assert.equal(next.payees.length, 2);
      assert.notEqual(next.payees[0].id, page.payees[0].id);
      assert.notEqual(next.payees[0].id, page.payees[1].id);

      const summaryResponse = await GET(authed("?view=summary"));
      const summary = await summaryResponse.json();
      assert.equal(summary.payees.length, page.total);
      assert.equal(summary.hasMore, false);
      assert.equal("iconImage" in summary.payees[0], false);
      assert.equal(typeof summary.payees[0].name, "string");

      const searchResponse = await GET(authed("?limit=10&q=netflix"));
      const search = await searchResponse.json();
      assert.ok(search.payees.length >= 1);
      assert.ok(search.payees.every((payee: { name: string }) => payee.name.toLowerCase().includes("netflix")));
      assert.ok(search.total < page.total);
    } finally {
      db.$client.close();
      clearConnectionCache();
    }
  });
});
