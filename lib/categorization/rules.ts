import { normalizeDescription } from "@/lib/import/normalize";

export const DEFAULTED_CATEGORY_WARNING_PREFIX = "Category defaulted to ";

export type RuleTransactionType = "debit" | "credit" | null;

export type CategorizationRule = {
  id: string;
  pattern: string;
  matchType: string;
  categoryName: string;
  transactionType: RuleTransactionType;
};

export type CategoryAllowance = {
  name: string;
  transactionType: RuleTransactionType;
};

export type RuleAnnotations = {
  ruleMatch?: string;
  ruleHint?: string;
  categoryTouched?: boolean;
};

export type CategorizableRow = {
  description: string;
  category: string;
  type: string;
  warnings: string[];
} & RuleAnnotations;

export type ImportLearnResult = {
  skippedDuplicates?: number;
  skippedIndexes?: number[];
};

export type LearnableRow = {
  description: string;
  category: string;
  type: string;
  categoryTouched?: boolean;
  excluded?: boolean;
};

export const hasDefaultedCategoryWarning = (warnings: readonly string[]): boolean =>
  warnings.some((warning) => warning.startsWith(DEFAULTED_CATEGORY_WARNING_PREFIX));

export const categoryNameAllowedForType = (
  categories: readonly CategoryAllowance[],
  categoryName: string,
  type: "debit" | "credit"
): boolean => {
  const category = categories.find((item) => item.name === categoryName);
  if (!category) return false;
  if (category.transactionType === null) return true;
  return category.transactionType === type;
};

export const categorySelectOptions = (
  categories: readonly CategoryAllowance[],
  row: { type: string; category: string }
): CategoryAllowance[] => {
  const named = categories.filter((category) => category.name.trim().length > 0);
  const legal =
    row.type === "debit" || row.type === "credit"
      ? named.filter(
          (category) => category.transactionType === row.type || category.transactionType === null
        )
      : named;

  if (!row.category.trim() || legal.some((category) => category.name === row.category)) {
    return legal;
  }

  return [...legal, { name: row.category, transactionType: null }];
};

export const formatRuleMatch = (rule: Pick<CategorizationRule, "pattern" | "categoryName">): string =>
  `Matched “${normalizeDescription(rule.pattern)}” → ${rule.categoryName}`;

export const formatRuleHint = (categoryName: string): string => `Rule says ${categoryName}`;

export const toCategoryAllowances = (
  categories: readonly { name: string; transactionType?: string | null }[]
): CategoryAllowance[] =>
  categories.map((category) => ({
    name: category.name,
    transactionType:
      category.transactionType === "debit" || category.transactionType === "credit"
        ? category.transactionType
        : null,
  }));

export const toCategorizationRules = (
  rules: readonly {
    id: string;
    pattern: string;
    matchType?: string | null;
    categoryName: string;
    transactionType?: string | null;
  }[]
): CategorizationRule[] =>
  rules.map((rule) => ({
    id: rule.id,
    pattern: rule.pattern,
    matchType: rule.matchType || "exact",
    categoryName: rule.categoryName,
    transactionType:
      rule.transactionType === "debit" || rule.transactionType === "credit" ? rule.transactionType : null,
  }));

export const fallbackCategoryName = (categories: readonly CategoryAllowance[]): string => {
  if (categories.some((category) => category.name === "Other Expenses")) return "Other Expenses";
  if (categories.some((category) => category.name === "Other")) return "Other";
  return "Other Expenses";
};

export const matchRule = (
  rules: readonly CategorizationRule[],
  description: string,
  type: "debit" | "credit",
  categories: readonly CategoryAllowance[]
): CategorizationRule | null => {
  const pattern = normalizeDescription(description);
  if (!pattern) return null;

  const candidates = rules.filter((rule) => {
    if (rule.matchType !== "exact") return false;
    if (rule.categoryName === "Transfer") return false;
    if (normalizeDescription(rule.pattern) !== pattern) return false;
    if (rule.transactionType !== null && rule.transactionType !== type) return false;
    return categoryNameAllowedForType(categories, rule.categoryName, type);
  });

  return candidates.find((rule) => rule.transactionType === type) ?? candidates.find((rule) => rule.transactionType === null) ?? null;
};

const withoutDefaultedWarning = (warnings: readonly string[]): string[] =>
  warnings.filter((warning) => !warning.startsWith(DEFAULTED_CATEGORY_WARNING_PREFIX));

export const applyRulesToRows = <Row extends CategorizableRow>(
  rows: readonly Row[],
  rules: readonly CategorizationRule[],
  categories: readonly CategoryAllowance[],
  options?: { replaceValidCategory?: boolean }
): Array<Row & RuleAnnotations> => {
  const names = new Set(categories.map((category) => category.name));

  return rows.map((row) => {
    if (row.type !== "debit" && row.type !== "credit") {
      return { ...row, ruleMatch: undefined, ruleHint: undefined };
    }

    const matched = matchRule(rules, row.description, row.type, categories);
    const defaulted = hasDefaultedCategoryWarning(row.warnings);
    const categoryValid = row.category.trim().length > 0 && names.has(row.category);
    const replace =
      Boolean(options?.replaceValidCategory) || !categoryValid || defaulted || row.category.trim().length === 0;

    if (matched && replace) {
      return {
        ...row,
        category: matched.categoryName,
        warnings: withoutDefaultedWarning(row.warnings),
        ruleMatch: formatRuleMatch(matched),
        ruleHint: undefined,
      };
    }

    if (matched && categoryValid && matched.categoryName !== row.category) {
      return {
        ...row,
        ruleMatch: undefined,
        ruleHint: formatRuleHint(matched.categoryName),
      };
    }

    return {
      ...row,
      ruleMatch: undefined,
      ruleHint: undefined,
    };
  });
};

export const reconcileReviewRow = <Row extends CategorizableRow>(
  previous: CategorizableRow,
  validated: Row,
  editedKey: string,
  rules: readonly CategorizationRule[],
  categories: readonly CategoryAllowance[]
): Row & RuleAnnotations => {
  const next: Row = {
    ...validated,
    ruleMatch: previous.ruleMatch,
    ruleHint: previous.ruleHint,
    categoryTouched: previous.categoryTouched,
  };

  if (next.type !== "debit" && next.type !== "credit") {
    return { ...next, ruleMatch: undefined, ruleHint: undefined };
  }

  const matched = matchRule(rules, next.description, next.type, categories);

  if (editedKey === "category") {
    const agrees = matched?.categoryName === next.category;
    return {
      ...next,
      categoryTouched: true,
      ruleMatch: agrees && matched ? formatRuleMatch(matched) : undefined,
      ruleHint: !agrees && matched ? formatRuleHint(matched.categoryName) : undefined,
    };
  }

  const defaulted =
    hasDefaultedCategoryWarning(previous.warnings) || hasDefaultedCategoryWarning(next.warnings);
  const canRematch =
    previous.categoryTouched !== true &&
    (editedKey === "description" || editedKey === "type") &&
    (defaulted || Boolean(previous.ruleMatch));

  if (canRematch) {
    if (matched) {
      return {
        ...next,
        category: matched.categoryName,
        warnings: withoutDefaultedWarning(next.warnings),
        ruleMatch: formatRuleMatch(matched),
        ruleHint: undefined,
        categoryTouched: undefined,
      };
    }
    return {
      ...next,
      ruleMatch: undefined,
      ruleHint: undefined,
      categoryTouched: undefined,
    };
  }

  if (previous.categoryTouched === true && (editedKey === "description" || editedKey === "type")) {
    const agrees = matched?.categoryName === next.category;
    return {
      ...next,
      categoryTouched: true,
      ruleMatch: agrees && matched ? formatRuleMatch(matched) : undefined,
      ruleHint: !agrees && matched ? formatRuleHint(matched.categoryName) : undefined,
    };
  }

  return next;
};

export const shouldBlankCategoryForRematch = (
  previous: CategorizableRow,
  editedKey: string
): boolean => {
  if (previous.categoryTouched === true) return false;
  if (editedKey !== "description" && editedKey !== "type") return false;
  return Boolean(previous.ruleMatch) || hasDefaultedCategoryWarning(previous.warnings);
};

export const rowQualifiesForLearn = (
  row: LearnableRow,
  categories: readonly CategoryAllowance[]
): boolean => {
  if (row.excluded) return false;
  if (row.categoryTouched !== true) return false;
  if (row.type !== "debit" && row.type !== "credit") return false;
  if (!normalizeDescription(row.description)) return false;
  if (row.category === "Transfer") return false;
  return categoryNameAllowedForType(categories, row.category, row.type);
};

// Null means the response reported skips without saying which rows, so nothing may be learned.
export const learnablePostedIndexes = (
  postedCount: number,
  result: ImportLearnResult
): number[] | null => {
  if (postedCount <= 0) return [];
  if (typeof result.skippedDuplicates === "number" && result.skippedDuplicates >= postedCount) {
    return [];
  }
  if (typeof result.skippedDuplicates === "number" && result.skippedDuplicates > 0 && !Array.isArray(result.skippedIndexes)) {
    return null;
  }
  const skipped = new Set(result.skippedIndexes ?? []);
  const indexes: number[] = [];
  for (let index = 0; index < postedCount; index += 1) {
    if (!skipped.has(index)) indexes.push(index);
  }
  return indexes;
};
