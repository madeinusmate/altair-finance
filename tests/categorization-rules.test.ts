import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRulesToRows,
  CategorizationRule,
  categorySelectOptions,
  CategoryAllowance,
  formatRuleHint,
  learnablePostedIndexes,
  matchRule,
  reconcileReviewRow,
  rowQualifiesForLearn,
} from "../lib/categorization/rules";

const categories: CategoryAllowance[] = [
  { name: "Food & Drink", transactionType: null },
  { name: "Shopping", transactionType: null },
  { name: "Other Expenses", transactionType: "debit" },
  { name: "Salary", transactionType: "credit" },
];

const rule = (overrides: Partial<CategorizationRule> & Pick<CategorizationRule, "id" | "categoryName">): CategorizationRule => ({
  pattern: "coffee shop",
  matchType: "exact",
  transactionType: "debit",
  ...overrides,
});

describe("category select options", () => {
  it("drops blank category names so a select item never receives an empty value", () => {
    const options = categorySelectOptions(
      [...categories, { name: "", transactionType: "debit" }, { name: "   ", transactionType: "debit" }],
      { type: "debit", category: "" }
    );

    assert.equal(
      options.every((option) => option.name.trim().length > 0),
      true
    );
    assert.equal(
      options.some((option) => option.name === "Food & Drink"),
      true
    );
    assert.equal(
      options.some((option) => option.name === "Salary"),
      false
    );
  });

  it("keeps an unrecognized category and omits a blank row category", () => {
    const recognized = categorySelectOptions(categories, { type: "debit", category: "Wedding" });
    const blank = categorySelectOptions(categories, { type: "transfer", category: "" });

    assert.equal(
      recognized.some((option) => option.name === "Wedding"),
      true
    );
    assert.equal(
      blank.every((option) => option.name.trim().length > 0),
      true
    );
    assert.equal(
      blank.some((option) => option.name === "Salary"),
      true
    );
  });
});

describe("categorization rules", () => {
  it("matches Coffee Shop and a spaced lowercase description to the same exact rule", () => {
    const rules = [rule({ id: "coffee", categoryName: "Food & Drink", pattern: "Coffee Shop" })];

    const fromTitle = matchRule(rules, "Coffee Shop", "debit", categories);
    const fromLoose = matchRule(rules, "  coffee   shop ", "debit", categories);

    assert.equal(fromTitle?.id, "coffee");
    assert.equal(fromLoose?.id, "coffee");
    assert.equal(fromTitle?.categoryName, "Food & Drink");
  });

  it("prefers a debit rule over an untyped rule and still uses the untyped rule for credit", () => {
    const rules = [
      rule({
        id: "open",
        categoryName: "Shopping",
        pattern: "starbucks",
        transactionType: null,
      }),
      rule({
        id: "typed",
        categoryName: "Food & Drink",
        pattern: "starbucks",
        transactionType: "debit",
      }),
    ];

    assert.equal(matchRule(rules, "Starbucks", "debit", categories)?.id, "typed");
    assert.equal(matchRule(rules, "Starbucks", "credit", categories)?.id, "open");
  });

  it("returns no match when the category is not allowed for that type", () => {
    const rules = [
      rule({
        id: "salary",
        categoryName: "Salary",
        pattern: "acme payroll",
        transactionType: null,
      }),
    ];

    assert.equal(matchRule(rules, "Acme Payroll", "debit", categories), null);
    assert.equal(matchRule(rules, "Acme Payroll", "credit", categories)?.categoryName, "Salary");
    assert.equal(
      matchRule(
        [rule({ id: "missing", categoryName: "Not A Category", pattern: "mystery" })],
        "mystery",
        "debit",
        categories
      ),
      null
    );
    assert.equal(
      matchRule(
        [rule({ id: "transfer", categoryName: "Transfer", pattern: "internal", transactionType: null })],
        "internal",
        "debit",
        [...categories, { name: "Transfer", transactionType: null }]
      ),
      null
    );
  });

  it("replaces Other Expenses when the defaulted warning is present and keeps a valid CSV category", () => {
    const rules = [rule({ id: "coffee", categoryName: "Food & Drink", pattern: "coffee shop" })];
    const rows = [
      {
        description: "Coffee Shop",
        category: "Other Expenses",
        type: "debit",
        warnings: ["Category defaulted to Other Expenses"],
      },
      {
        description: "Coffee Shop",
        category: "Shopping",
        type: "debit",
        warnings: [] as string[],
      },
    ];

    const [replaced, kept] = applyRulesToRows(rows, rules, categories);

    assert.equal(replaced.category, "Food & Drink");
    assert.equal(replaced.warnings.length, 0);
    assert.equal(replaced.ruleMatch, "Matched “coffee shop” → Food & Drink");
    assert.equal(replaced.ruleHint, undefined);
    assert.equal(replaced.categoryTouched, undefined);

    assert.equal(kept.category, "Shopping");
    assert.equal(kept.ruleMatch, undefined);
    assert.equal(kept.ruleHint, formatRuleHint("Food & Drink"));
    assert.equal(kept.categoryTouched, undefined);
  });

  it("does not match an empty description", () => {
    const rules = [rule({ id: "coffee", categoryName: "Food & Drink" })];

    assert.equal(matchRule(rules, "", "debit", categories), null);
    assert.equal(matchRule(rules, "   ", "debit", categories), null);
    assert.equal(
      applyRulesToRows(
        [{ description: "   ", category: "Other Expenses", type: "debit", warnings: ["Category defaulted to Other Expenses"] }],
        rules,
        categories
      )[0].category,
      "Other Expenses"
    );
  });

  it("ignores contains even when that match type is stored", () => {
    const rules = [
      rule({
        id: "contains",
        categoryName: "Food & Drink",
        pattern: "coffee",
        matchType: "contains",
      }),
    ];

    assert.equal(matchRule(rules, "coffee", "debit", categories), null);
    assert.equal(matchRule(rules, "coffee shop", "debit", categories), null);
  });

  it("sets categoryTouched on a category edit and clears ruleMatch when the category differs", () => {
    const rules = [rule({ id: "coffee", categoryName: "Food & Drink", pattern: "coffee shop" })];
    const previous = {
      description: "Coffee Shop",
      category: "Food & Drink",
      type: "debit",
      warnings: [] as string[],
      ruleMatch: "Matched “coffee shop” → Food & Drink",
    };
    const changed = reconcileReviewRow(
      previous,
      { ...previous, category: "Shopping" },
      "category",
      rules,
      categories
    );
    const kept = reconcileReviewRow(previous, previous, "amount", rules, categories);

    const described = reconcileReviewRow(
      { ...previous, categoryTouched: true, category: "Shopping", ruleMatch: undefined },
      { ...previous, categoryTouched: true, category: "Shopping", description: "Coffee Shop" },
      "description",
      rules,
      categories
    );

    assert.equal(changed.categoryTouched, true);
    assert.equal(changed.category, "Shopping");
    assert.equal(changed.ruleMatch, undefined);
    assert.equal(changed.ruleHint, "Rule says Food & Drink");
    assert.equal(kept.categoryTouched, undefined);
    assert.equal(kept.ruleMatch, previous.ruleMatch);
    assert.equal(kept.category, "Food & Drink");
    assert.equal(described.categoryTouched, true);
    assert.equal(described.category, "Shopping");
    assert.equal(described.ruleHint, "Rule says Food & Drink");
  });

  it("learns only inserted rows the person actually categorized", () => {
    const touched = {
      description: "Coffee Shop",
      category: "Food & Drink",
      type: "debit",
      categoryTouched: true,
    };

    assert.equal(rowQualifiesForLearn(touched, categories), true);
    assert.equal(rowQualifiesForLearn({ ...touched, categoryTouched: false }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, categoryTouched: undefined }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, description: "   " }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, type: "transfer" }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, excluded: true }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, category: "Transfer" }, categories), false);
    assert.equal(rowQualifiesForLearn({ ...touched, category: "Salary" }, categories), false);

    assert.deepEqual(learnablePostedIndexes(3, {}), [0, 1, 2]);
    assert.deepEqual(learnablePostedIndexes(3, { skippedDuplicates: 3 }), []);
    assert.deepEqual(learnablePostedIndexes(3, { skippedDuplicates: 1, skippedIndexes: [1] }), [0, 2]);
    assert.equal(learnablePostedIndexes(3, { skippedDuplicates: 1 }), null);
  });
});
