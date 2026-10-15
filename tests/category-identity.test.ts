import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferCatalogType } from "../lib/db/category-identity";

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

  it("returns null when there are no transactions", () => {
    assert.equal(inferCatalogType([]), null);
  });
});
