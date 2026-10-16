import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  orderWithDefault,
  parseEnabledCurrencies,
  pickDisplayCurrency,
  readEnabledCurrencies,
  withHomeCurrency,
} from "../lib/currencies";

describe("enabled currencies", () => {
  it("keeps supported currencies in catalog order", () => {
    const result = parseEnabledCurrencies(["gbp", "USD", "sgd"]);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.currencies, ["USD", "SGD", "GBP"]);
    }
  });

  it("rejects an empty list and an unknown code", () => {
    assert.equal(parseEnabledCurrencies([]).ok, false);
    assert.equal(parseEnabledCurrencies(["XYZ"]).ok, false);
  });

  it("reads a stored list and falls back when the value is missing", () => {
    assert.deepEqual(readEnabledCurrencies(null), ["HKD", "USD", "SGD", "EUR", "GBP"]);
    assert.deepEqual(readEnabledCurrencies('["EUR","HKD"]'), ["HKD", "EUR"]);
    assert.deepEqual(readEnabledCurrencies("not-json"), ["HKD", "USD", "SGD", "EUR", "GBP"]);
  });

  it("keeps the home currency enabled and uses it as the default view", () => {
    assert.deepEqual(withHomeCurrency(["USD", "EUR"], "HKD"), ["HKD", "USD", "EUR"]);
    assert.equal(pickDisplayCurrency(["USD", "EUR"], "HKD"), "USD");
    assert.equal(pickDisplayCurrency(["USD", "EUR", "HKD"], "HKD"), "HKD");
  });

  it("puts the default currency first and leaves the rest in catalog order", () => {
    assert.deepEqual(orderWithDefault(["HKD", "USD", "SGD", "EUR", "GBP"], "SGD"), [
      "SGD",
      "HKD",
      "USD",
      "EUR",
      "GBP",
    ]);
    assert.deepEqual(orderWithDefault(["HKD", "USD", "EUR"], "EUR"), ["EUR", "HKD", "USD"]);
    assert.deepEqual(orderWithDefault(["USD", "EUR"], null), ["USD", "EUR"]);
    assert.deepEqual(orderWithDefault(["USD", "EUR"], "HKD"), ["USD", "EUR"]);
  });
});
