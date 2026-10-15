import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferCatalogType, legalReassignCategoryIds } from "../lib/db/category-identity";

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

describe("legalReassignCategoryIds", () => {
  const categories = [
    { id: 1, transactionType: "debit" as const, hasBudget: false },
    { id: 2, transactionType: "credit" as const, hasBudget: false },
    { id: 3, transactionType: null, hasBudget: false },
    { id: 4, transactionType: "debit" as const, hasBudget: true },
  ];

  it("allows debit or null-type destinations for debit rows", () => {
    assert.deepEqual(
      legalReassignCategoryIds(
        { debitTransactions: 2, creditTransactions: 0, transfers: 0, budgets: 0 },
        categories,
        9
      ),
      [1, 3, 4]
    );
  });

  it("refuses a typed destination when transfers are referenced", () => {
    assert.deepEqual(
      legalReassignCategoryIds(
        { debitTransactions: 1, creditTransactions: 0, transfers: 1, budgets: 0 },
        categories,
        9
      ),
      [3]
    );
  });

  it("refuses every destination when a budget and a transfer must move together", () => {
    assert.deepEqual(
      legalReassignCategoryIds(
        { debitTransactions: 0, creditTransactions: 0, transfers: 1, budgets: 1 },
        categories,
        9
      ),
      []
    );
  });
});
