/**
 * Converts a category name to a snake_case identifier
 * Examples:
 * - "Credit Card" -> "credit_card"
 * - "Savings Account" -> "savings_account"
 * - "Checking Account!" -> "checking_account"
 * - "401(k)" -> "401k"
 */
export const generateCategoryIdentifier = (name: string): string => {
  if (!name || typeof name !== "string") {
    throw new Error("Name must be a non-empty string");
  }

  return name
    .trim()
    .toLowerCase()
    // Replace spaces and common separators with underscores
    .replace(/[\s\-_]+/g, "_")
    // Remove all non-alphanumeric characters except underscores
    .replace(/[^a-z0-9_]/g, "")
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, "")
    // Collapse multiple underscores into one
    .replace(/_+/g, "_")
    // Ensure it starts with a letter (if it starts with a number, prefix with "cat_")
    .replace(/^(\d)/, "cat_$1")
    // Ensure minimum length of 1
    || "category";
};

/**
 * Generates a unique identifier by appending a number if the base identifier already exists
 */
export const generateUniqueCategoryIdentifier = (
  baseIdentifier: string,
  existingIdentifiers: string[]
): string => {
  let identifier = baseIdentifier;
  let counter = 1;

  while (existingIdentifiers.includes(identifier)) {
    identifier = `${baseIdentifier}_${counter}`;
    counter++;
  }

  return identifier;
};
