// Account category constants and utilities

export const ACCOUNT_CATEGORIES = [
  "auto_loan",
  "brokerage",
  "cash",
  "checking",
  "credit_card",
  "crypto",
  "investment",
  "line_of_credit",
  "mortgage",
  "other_asset",
  "other_liability",
  "personal_loan",
  "physical_asset",
  "real_estate",
  "retirement_401k",
  "retirement_ira",
  "retirement_other",
  "retirement_roth_ira",
  "savings",
  "student_loan",
  "vehicle",
] as const;

export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

/**
 * Format a category value for display (e.g., "credit_card" -> "Credit Card")
 * Accepts string for compatibility with database-stored categories
 */
export const formatCategoryDisplay = (category: string): string => {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Validate if a string is a valid account category
 */
export const isValidAccountCategory = (value: string): value is AccountCategory => {
  return ACCOUNT_CATEGORIES.includes(value as AccountCategory);
};
