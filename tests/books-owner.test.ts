import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { booksOwnerEnabled, getOwnerPassphrase, setOwnerPassphrase } from "../lib/books-owner";

describe("books owner passphrase", () => {
  it("stores the passphrase on the process", () => {
    setOwnerPassphrase("correct horse");
    assert.equal(getOwnerPassphrase(), "correct horse");
    assert.equal(
      (globalThis as typeof globalThis & { "altair.ownerPassphrase"?: string })["altair.ownerPassphrase"],
      "correct horse",
    );
    setOwnerPassphrase(null);
    assert.equal(getOwnerPassphrase(), null);
  });

  it("treats a Netly books-owner process as the owner", () => {
    const previous = process.env.NETLY_BOOKS_OWNER;
    const current = process.env.ALTAIR_BOOKS_OWNER;
    delete process.env.ALTAIR_BOOKS_OWNER;
    process.env.NETLY_BOOKS_OWNER = "1";
    try {
      assert.equal(booksOwnerEnabled(), true);
    } finally {
      if (previous === undefined) delete process.env.NETLY_BOOKS_OWNER;
      else process.env.NETLY_BOOKS_OWNER = previous;
      if (current === undefined) delete process.env.ALTAIR_BOOKS_OWNER;
      else process.env.ALTAIR_BOOKS_OWNER = current;
    }
  });
});
