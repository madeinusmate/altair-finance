import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateTransactionRows } from "../lib/csv/import-validators";
import type { Account } from "../lib/db/schema";

const account = (name: string): Account => ({
  id: name.toLowerCase(),
  name,
  type: "transaction",
  nature: "asset",
  category: "checking_account",
  currency: "USD",
  initialBalance: 0,
  icon: null,
  iconImage: null,
  metadata: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const accounts = [account("Checking"), account("Savings")];
const categories = ["Groceries", "Income", "Other Expenses"];

const baseRow = {
  date: "2024-01-15",
  account: "Checking",
  description: "STARBUCKS #1234",
  amount: "5.00",
  from_amount: "",
  to_amount: "",
  category: "Groceries",
  type: "debit",
  transfer_account: "",
};

describe("csv transaction payee", () => {
  it("uses a payee column and keeps it ahead of the statement line", () => {
    const [row] = validateTransactionRows(
      [{ ...baseRow, payee: "STARBUCKS #99" }],
      accounts,
      categories
    );
    assert.equal(row.payeeName, "STARBUCKS");
    assert.equal(row.payeeEdited, true);
    assert.equal(row.errors.length, 0);
  });

  it("reads a Payee Name header", () => {
    const [row] = validateTransactionRows(
      [{ ...baseRow, payee_name: "Corner Cafe" }],
      accounts,
      categories
    );
    assert.equal(row.payeeName, "Corner Cafe");
    assert.equal(row.payeeEdited, true);
  });

  it("suggests the payee from the statement line when the column is blank", () => {
    const [missing] = validateTransactionRows([baseRow], accounts, categories);
    const [blank] = validateTransactionRows([{ ...baseRow, payee: "  " }], accounts, categories);
    assert.equal(missing.payeeName, "STARBUCKS");
    assert.equal(missing.payeeEdited, false);
    assert.equal(blank.payeeName, "STARBUCKS");
    assert.equal(blank.payeeEdited, false);
  });

  it("leaves transfers without a payee", () => {
    const [row] = validateTransactionRows(
      [
        {
          ...baseRow,
          description: "Transfer to Savings",
          payee: "Landlord",
          amount: "",
          from_amount: "100.00",
          to_amount: "100.00",
          category: "",
          type: "transfer",
          transfer_account: "Savings",
        },
      ],
      accounts,
      categories
    );
    assert.equal(row.payeeName, "");
    assert.equal(row.payeeEdited, false);
    assert.equal(row.errors.length, 0);
  });
});
