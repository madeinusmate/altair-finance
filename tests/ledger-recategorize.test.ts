import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legalCategoryIds, type RecategorizeCategory, type RecategorizeRow } from "../lib/ledger/recategorize";

const categories: RecategorizeCategory[] = [
  { id: 1, transactionType: "debit" },
  { id: 2, transactionType: "credit" },
  { id: 3, transactionType: null },
  { id: 4, transactionType: "debit" },
];

const debit = (): RecategorizeRow => ({ kind: "transaction", type: "debit" });
const credit = (): RecategorizeRow => ({ kind: "transaction", type: "credit" });
const transfer = (): RecategorizeRow => ({ kind: "transfer" });

describe("legalCategoryIds", () => {
  it("includes debit and null-type categories for debits only", () => {
    assert.deepEqual(legalCategoryIds([debit(), debit()], categories), [1, 3, 4]);
  });

  it("includes credit and null-type categories for credits only", () => {
    assert.deepEqual(legalCategoryIds([credit()], categories), [2, 3]);
  });

  it("includes only null-type categories for transfers", () => {
    assert.deepEqual(legalCategoryIds([transfer(), transfer()], categories), [3]);
  });

  it("includes only null-type categories for a debit and a credit", () => {
    assert.deepEqual(legalCategoryIds([debit(), credit()], categories), [3]);
  });

  it("includes only null-type categories for a debit and a transfer", () => {
    assert.deepEqual(legalCategoryIds([debit(), transfer()], categories), [3]);
  });

  it("returns an empty list for an empty selection", () => {
    assert.deepEqual(legalCategoryIds([], categories), []);
  });
});
