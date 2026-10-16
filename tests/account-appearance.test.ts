import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAccountIcon, parseAccountIconImage } from "../lib/accounts/appearance";

const jpeg = "data:image/jpeg;base64,aaaa";

describe("account appearance", () => {
  it("accepts an empty icon and a lucide name", () => {
    assert.deepEqual(parseAccountIcon(""), { ok: true, icon: null });
    assert.deepEqual(parseAccountIcon("  PiggyBank  "), { ok: true, icon: "PiggyBank" });
  });

  it("rejects an icon name with spaces", () => {
    const result = parseAccountIcon("piggy bank");
    assert.equal(result.ok, false);
  });

  it("accepts a photo data URL and clears an empty one", () => {
    assert.deepEqual(parseAccountIconImage(null), { ok: true, iconImage: null });
    assert.deepEqual(parseAccountIconImage(jpeg), { ok: true, iconImage: jpeg });
  });

  it("rejects a photo that is not a data URL", () => {
    const result = parseAccountIconImage("https://example.com/avatar.png");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "Use a JPEG, PNG, or WebP photo.");
    }
  });
});
