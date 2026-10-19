import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_AVATAR_DATA_URL_LENGTH, parseProfileInput } from "../lib/user-profile";

describe("parseProfileInput", () => {
  it("trims a valid profile and clears optional fields", () => {
    const result = parseProfileInput({
      name: "  Ada Lovelace  ",
      email: "  ",
      avatar: null,
      preferredCurrency: null,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.profile, {
        name: "Ada Lovelace",
        email: null,
        preferredCurrency: null,
        avatar: null,
        enabledCurrencies: ["HKD", "USD", "SGD", "EUR", "GBP", "CHF"],
      });
    }
  });

  it("accepts email and a supported currency", () => {
    const result = parseProfileInput({
      name: "Ada",
      email: "ada@example.com",
      preferredCurrency: "sgd",
      avatar: null,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.profile.email, "ada@example.com");
      assert.equal(result.profile.preferredCurrency, "SGD");
    }
  });

  it("rejects an empty name, a bad email, and an unknown currency", () => {
    assert.equal(parseProfileInput({ name: " ", email: "", avatar: null, preferredCurrency: null }).ok, false);
    assert.equal(
      parseProfileInput({ name: "Ada", email: "not-an-email", avatar: null, preferredCurrency: null }).ok,
      false
    );
    assert.equal(
      parseProfileInput({ name: "Ada", email: "", avatar: null, preferredCurrency: "XYZ" }).ok,
      false
    );
  });

  it("accepts a photo data url and rejects other image sources", () => {
    const photo = "data:image/jpeg;base64,aaaa";
    const accepted = parseProfileInput({
      name: "Ada",
      email: "",
      avatar: photo,
      preferredCurrency: null,
    });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.profile.avatar, photo);
    }

    assert.equal(
      parseProfileInput({
        name: "Ada",
        email: "",
        avatar: "data:image/svg+xml;base64,PHN2Zy8+",
        preferredCurrency: null,
      }).ok,
      false
    );
    assert.equal(
      parseProfileInput({
        name: "Ada",
        email: "",
        avatar: `data:image/jpeg;base64,${"a".repeat(MAX_AVATAR_DATA_URL_LENGTH)}`,
        preferredCurrency: null,
      }).ok,
      false
    );
  });
});
