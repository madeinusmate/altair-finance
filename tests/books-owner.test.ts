import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOwnerPassphrase, setOwnerPassphrase } from "../lib/books-owner";

describe("books owner passphrase", () => {
  it("stores the passphrase on the process", () => {
    setOwnerPassphrase("correct horse");
    assert.equal(getOwnerPassphrase(), "correct horse");
    assert.equal(
      (globalThis as typeof globalThis & { "netly.ownerPassphrase"?: string })["netly.ownerPassphrase"],
      "correct horse",
    );
    setOwnerPassphrase(null);
    assert.equal(getOwnerPassphrase(), null);
  });
});
