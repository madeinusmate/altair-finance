import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanPayee } from "../lib/payees/normalize";

describe("cleanPayee", () => {
  it("collapses Starbucks store numbers onto one payee", () => {
    const first = cleanPayee("STARBUCKS #1234");
    const second = cleanPayee("Starbucks 5678");
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.normalizedName, "starbucks");
    assert.equal(second.normalizedName, first.normalizedName);
    assert.equal(first.displayName, "STARBUCKS");
    assert.equal(second.displayName, "Starbucks");
  });

  it("keeps Uber Trip and Uber Eats apart", () => {
    const trip = cleanPayee("UBER * TRIP 4821");
    const eats = cleanPayee("UBER * EATS 99");
    assert.equal(trip?.normalizedName, "uber * trip");
    assert.equal(eats?.normalizedName, "uber * eats");
    assert.notEqual(trip?.normalizedName, eats?.normalizedName);
  });

  it("returns null for blank input", () => {
    assert.equal(cleanPayee(null), null);
    assert.equal(cleanPayee(undefined), null);
    assert.equal(cleanPayee(""), null);
    assert.equal(cleanPayee("   "), null);
  });

  it("strips a trailing *123 reference", () => {
    assert.equal(cleanPayee("NETFLIX *123")?.displayName, "NETFLIX");
    assert.equal(cleanPayee("NETFLIX *123")?.normalizedName, "netflix");
  });

  it("keeps internal punctuation", () => {
    assert.equal(cleanPayee("A&B Cafe")?.displayName, "A&B Cafe");
    assert.equal(cleanPayee("O'REILLY AUTO")?.normalizedName, "o'reilly auto");
  });
});
