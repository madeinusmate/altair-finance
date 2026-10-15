import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePayeeIconImage, PayeeIconImageError } from "../lib/payees/icon-image";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("normalizePayeeIconImage", () => {
  it("accepts a small PNG data URL", () => {
    assert.equal(normalizePayeeIconImage(TINY_PNG), TINY_PNG);
    assert.equal(normalizePayeeIconImage(""), null);
    assert.equal(normalizePayeeIconImage(null), null);
  });

  it("rejects other formats and oversized payloads", () => {
    assert.throws(
      () => normalizePayeeIconImage("data:image/svg+xml;base64,PHN2Zy8+"),
      PayeeIconImageError
    );
    const padded = `data:image/png;base64,${"A".repeat(40_000)}`;
    assert.throws(() => normalizePayeeIconImage(padded), /16 KB/);
  });

  it("rejects a data URL whose bytes do not match the declared type", () => {
    assert.throws(
      () => normalizePayeeIconImage("data:image/jpeg;base64,aGVsbG8="),
      PayeeIconImageError
    );
  });
});