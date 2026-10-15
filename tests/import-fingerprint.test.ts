import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  balanceFingerprint,
  balanceFingerprintPayload,
  transactionFingerprint,
  transactionFingerprintPayload,
  transferFingerprint,
  transferFingerprintPayload,
} from "../lib/import/fingerprint";
import { planImportRows } from "../lib/import/plan-import-rows";
import { applyReviewDuplicates, type DuplicateReviewFields } from "../lib/import/review-duplicates";

const transactionInput = {
  accountId: "acct-1",
  date: "2024-03-15",
  amount: 10,
  description: "Coffee",
  type: "debit" as const,
};

describe("import fingerprints", () => {
  it("keeps a different description, including case and spacing, as a different row", async () => {
    const spaced = await transactionFingerprint({
      ...transactionInput,
      description: "  STARBUCKS   Store ",
    });
    const plain = await transactionFingerprint({
      ...transactionInput,
      description: "starbucks store",
    });
    const coffee = await transactionFingerprint(transactionInput);
    const tea = await transactionFingerprint({ ...transactionInput, description: "Tea" });
    assert.notEqual(spaced, plain);
    assert.notEqual(coffee, tea);
  });

  it("does not treat a date one day away as the same row", async () => {
    const today = await transactionFingerprint(transactionInput);
    const tomorrow = await transactionFingerprint({ ...transactionInput, date: "2024-03-16" });
    assert.notEqual(today, tomorrow);
  });

  it("does not treat a different category or payee as the same row", async () => {
    const base = await transactionFingerprint({
      ...transactionInput,
      category: "Food & Drink",
      payee: "Cafe",
    });
    const otherCategory = await transactionFingerprint({
      ...transactionInput,
      category: "Shopping",
      payee: "Cafe",
    });
    const otherPayee = await transactionFingerprint({
      ...transactionInput,
      category: "Food & Drink",
      payee: "Tea Shop",
    });
    const identical = await transactionFingerprint({
      ...transactionInput,
      category: "Food & Drink",
      payee: "Cafe",
    });
    assert.notEqual(base, otherCategory);
    assert.notEqual(base, otherPayee);
    assert.equal(base, identical);
  });

  it("hashes debit and credit differently", async () => {
    const debit = await transactionFingerprint(transactionInput);
    const credit = await transactionFingerprint({ ...transactionInput, type: "credit" });
    assert.notEqual(debit, credit);
  });

  it("matches amounts at cents and keeps a one-cent difference", async () => {
    const ten = await transactionFingerprint({ ...transactionInput, amount: 10 });
    const rounded = await transactionFingerprint({ ...transactionInput, amount: 10.004 });
    const penny = await transactionFingerprint({ ...transactionInput, amount: 10.01 });
    assert.equal(ten, rounded);
    assert.notEqual(ten, penny);
  });

  it("includes transfer direction in the hash", async () => {
    const forward = await transferFingerprint({
      fromAccountId: "from",
      toAccountId: "to",
      date: "2024-03-15",
      fromAmount: 20,
      toAmount: 20,
    });
    const reversed = await transferFingerprint({
      fromAccountId: "to",
      toAccountId: "from",
      date: "2024-03-15",
      fromAmount: 20,
      toAmount: 20,
    });
    assert.notEqual(forward, reversed);
  });

  it("hashes a null description the same as an empty description", async () => {
    const missing = await transactionFingerprint({ ...transactionInput, description: null });
    const empty = await transactionFingerprint({ ...transactionInput, description: "" });
    assert.equal(missing, empty);
  });

  it("matches node:crypto SHA-256 for the same payload", async () => {
    const payload = transactionFingerprintPayload(transactionInput);
    assert.ok(payload);
    const expected = createHash("sha256").update(payload).digest("hex");
    assert.equal(await transactionFingerprint(transactionInput), expected);

    const balancePayload = balanceFingerprintPayload({
      accountId: "savings",
      date: "2024-03-15",
      balance: 10.004,
    });
    assert.equal(
      balancePayload,
      balanceFingerprintPayload({ accountId: "savings", date: "2024-03-15", balance: 10 })
    );
    assert.equal(
      await balanceFingerprint({ accountId: "savings", date: "2024-03-15", balance: 10.004 }),
      createHash("sha256").update(balancePayload!).digest("hex")
    );

    const transferPayload = transferFingerprintPayload({
      fromAccountId: "from",
      toAccountId: "to",
      date: "2024-03-15",
      fromAmount: 20,
      toAmount: 18,
    });
    assert.equal(
      await transferFingerprint({
        fromAccountId: "from",
        toAccountId: "to",
        date: "2024-03-15",
        fromAmount: 20,
        toAmount: 18,
      }),
      createHash("sha256").update(transferPayload!).digest("hex")
    );
  });

  it("holds every copy of an in-file duplicate unless that row is confirmed", () => {
    const fingerprint = "abc";
    const { decisions, skippedDuplicates, flaggedDuplicates, skippedIndexes } = planImportRows([], [
      { fingerprint, overrideDuplicate: false },
      { fingerprint, overrideDuplicate: true },
      { fingerprint },
    ]);
    assert.deepEqual(
      decisions.map((decision) => decision.insert),
      [false, true, false]
    );
    assert.deepEqual(
      decisions.map((decision) => decision.reason),
      ["in-file", "in-file", "in-file"]
    );
    assert.equal(skippedDuplicates, 2);
    assert.deepEqual(skippedIndexes, [0, 2]);
    assert.deepEqual(
      flaggedDuplicates.map((row) => row.imported),
      [false, true, false]
    );
  });

  it("flags a ledger match as existing and keeps a confirmed copy", () => {
    const { decisions, flaggedDuplicates } = planImportRows(["abc"], [
      { fingerprint: "abc" },
      { fingerprint: "abc", overrideDuplicate: true },
      { fingerprint: "other" },
    ]);
    assert.deepEqual(
      decisions.map((decision) => [decision.insert, decision.reason]),
      [
        [false, "existing"],
        [true, "existing"],
        [true, null],
      ]
    );
    assert.equal(flaggedDuplicates.length, 2);
  });

  it("holds both copies of an in-file duplicate and keeps an already included match", () => {
    const input: DuplicateReviewFields[] = [
      { fingerprint: "new", errors: [], warnings: [], duplicate: false, excluded: false },
      { fingerprint: "new", errors: [], warnings: [], duplicate: false, excluded: false },
      {
        fingerprint: "kept",
        errors: [],
        warnings: ["Exact duplicate"],
        duplicate: true,
        excluded: false,
        overrideDuplicate: true,
      },
    ];
    const rows = applyReviewDuplicates(input, ["kept"]);
    assert.equal(rows[0].duplicate, true);
    assert.equal(rows[0].excluded, true);
    assert.equal(rows[0].overrideDuplicate, false);
    assert.equal(rows[0].warnings.includes("Exact duplicate"), true);
    assert.equal(rows[1].duplicate, true);
    assert.equal(rows[1].excluded, true);
    assert.equal(rows[1].overrideDuplicate, false);
    assert.equal(rows[2].duplicate, true);
    assert.equal(rows[2].excluded, false);
    assert.equal(rows[2].overrideDuplicate, true);
    assert.deepEqual(rows[2].warnings, ["Exact duplicate"]);
  });
});
