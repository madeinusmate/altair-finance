import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  currencyFractionDigits,
  orderWithDefault,
  parseEnabledCurrencies,
  pickDisplayCurrency,
  readEnabledCurrencies,
  SUPPORTED_CURRENCIES,
  withHomeCurrency,
} from "../lib/currencies";

const catalog = [...SUPPORTED_CURRENCIES];

describe("enabled currencies", () => {
  it("keeps supported currencies in catalog order", () => {
    const result = parseEnabledCurrencies(["gbp", "USD", "sgd", "chf", "krw", "thb", "jpy"]);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.currencies, ["USD", "SGD", "GBP", "CHF", "JPY", "THB", "KRW"]);
    }
  });

  it("rejects an empty list and an unknown code", () => {
    assert.equal(parseEnabledCurrencies([]).ok, false);
    assert.equal(parseEnabledCurrencies(["XYZ"]).ok, false);
  });

  it("reads a stored list and falls back when the value is missing", () => {
    assert.deepEqual(readEnabledCurrencies(null), catalog);
    assert.deepEqual(readEnabledCurrencies('["EUR","HKD"]'), ["HKD", "EUR"]);
    assert.deepEqual(readEnabledCurrencies("not-json"), catalog);
  });

  it("keeps the home currency enabled and uses it as the default view", () => {
    assert.deepEqual(withHomeCurrency(["USD", "EUR"], "HKD"), ["HKD", "USD", "EUR"]);
    assert.equal(pickDisplayCurrency(["USD", "EUR"], "HKD"), "USD");
    assert.equal(pickDisplayCurrency(["USD", "EUR", "HKD"], "HKD"), "HKD");
  });

  it("puts the default currency first and leaves the rest in catalog order", () => {
    assert.deepEqual(orderWithDefault(catalog, "SGD"), ["SGD", ...catalog.filter((currency) => currency !== "SGD")]);
    assert.deepEqual(orderWithDefault(["HKD", "USD", "EUR"], "EUR"), ["EUR", "HKD", "USD"]);
    assert.deepEqual(orderWithDefault(["USD", "EUR"], null), ["USD", "EUR"]);
    assert.deepEqual(orderWithDefault(["USD", "EUR"], "HKD"), ["USD", "EUR"]);
  });

  it("shows yen and won with no minor unit", () => {
    assert.equal(currencyFractionDigits("JPY"), 0);
    assert.equal(currencyFractionDigits("krw"), 0);
    assert.equal(currencyFractionDigits("THB"), 2);
    assert.equal(currencyFractionDigits("TWD"), 2);
    assert.deepEqual(catalog.slice(-9), ["JPY", "AUD", "CNY", "CAD", "NZD", "MYR", "THB", "TWD", "KRW"]);
  });
});
