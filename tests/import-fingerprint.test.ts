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
import { applyReviewDuplicates } from "../lib/import/review-duplicates";

const transactionInput = {
  accountId: "acct-1",
  date: "2024-03-15",
  amount: 10,
  description: "Coffee",
  type: "debit" as const,
};

describe("import fingerprints", () => {
  it("hashes the same description with different case and extra spaces as equal", async () => {
    const spaced = await transactionFingerprint({
      ...transactionInput,
      description: "  STARBUCKS   Store ",
    });
    const plain = await transactionFingerprint({
      ...transactionInput,
      description: "starbucks store",
    });
    assert.equal(spaced, plain);
    assert.ok(spaced);
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

  it("skips a later copy unless that row overrides, then skips a third copy", () => {
    const fingerprint = "abc";
    const { decisions, skippedDuplicates } = planImportRows([], [
      { fingerprint, overrideDuplicate: false },
      { fingerprint, overrideDuplicate: true },
      { fingerprint },
    ]);
    assert.deepEqual(
      decisions.map((decision) => decision.insert),
      [true, true, false]
    );
    assert.equal(skippedDuplicates, 1);
  });

  it("excludes a duplicate review row until it is included", () => {
    const rows = applyReviewDuplicates(
      [
        { fingerprint: "new", errors: [], warnings: [], duplicate: false, excluded: false },
        { fingerprint: "new", errors: [], warnings: [], duplicate: false, excluded: false },
        {
          fingerprint: "kept",
          errors: [],
          warnings: [],
          duplicate: true,
          excluded: false,
          overrideDuplicate: true,
        },
      ],
      ["kept"]
    );
    assert.equal(rows[0].duplicate, false);
    assert.equal(rows[0].excluded, false);
    assert.equal(rows[1].duplicate, true);
    assert.equal(rows[1].excluded, true);
    assert.equal(rows[1].overrideDuplicate, false);
    assert.equal(rows[2].duplicate, true);
    assert.equal(rows[2].excluded, false);
    assert.equal(rows[2].overrideDuplicate, true);
    assert.equal(rows[2].warnings.includes("Possible duplicate"), false);
  });
});
