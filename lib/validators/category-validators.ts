export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a category name
 * Rules:
 * - Non-empty
 * - Length 1-50 characters
 * - Alphanumeric + spaces/hyphens only
 */
export const validateCategoryName = (name: string): ValidationResult => {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Category name is required" };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Category name cannot be empty" };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: "Category name must be 50 characters or less" };
  }

  // Allow alphanumeric, spaces, hyphens, and ampersands
  const validPattern = /^[a-zA-Z0-9\s\-&]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: "Category name can only contain letters, numbers, spaces, hyphens, and ampersands" };
  }

  return { valid: true };
};

/**
 * Validates an account category identifier (snake_case)
 * Rules:
 * - Non-empty
 * - Length 1-50 characters
 * - Snake_case format (lowercase letters, numbers, underscores)
 * - Must start with a letter
 */
export const validateAccountCategoryIdentifier = (identifier: string): ValidationResult => {
  if (!identifier || typeof identifier !== "string") {
    return { valid: false, error: "Category identifier is required" };
  }

  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Category identifier cannot be empty" };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: "Category identifier must be 50 characters or less" };
  }

  // Snake_case: lowercase letters, numbers, underscores, must start with letter
  const snakeCasePattern = /^[a-z][a-z0-9_]*$/;
  if (!snakeCasePattern.test(trimmed)) {
    return { valid: false, error: "Category identifier must be in snake_case format (lowercase letters, numbers, underscores, starting with a letter)" };
  }

  return { valid: true };
};

/**
 * Validates a hex color string
 */
export const validateColor = (color: string | null | undefined): ValidationResult => {
  if (!color) {
    return { valid: true }; // Color is optional
  }

  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!hexPattern.test(color)) {
    return { valid: false, error: "Color must be a valid hex color (e.g., #FF5733 or #FFF)" };
  }

  return { valid: true };
};

/**
 * Validates an icon name (lucide-react icon identifier)
 */
export const validateIcon = (icon: string | null | undefined): ValidationResult => {
  if (!icon) {
    return { valid: true }; // Icon is optional
  }

  // Basic validation: alphanumeric and hyphens, reasonable length
  const iconPattern = /^[a-zA-Z0-9\-]+$/;
  if (!iconPattern.test(icon)) {
    return { valid: false, error: "Icon name can only contain letters, numbers, and hyphens" };
  }

  if (icon.length > 50) {
    return { valid: false, error: "Icon name must be 50 characters or less" };
  }

  return { valid: true };
};

/**
 * Validates a transaction type
 * Rules:
 * - Must be "debit", "credit", or null (for special categories like Transfer)
 */
export const validateTransactionType = (transactionType: string | null | undefined): ValidationResult => {
  if (transactionType === null || transactionType === undefined) {
    return { valid: true }; // null is allowed for special categories
  }

  if (typeof transactionType !== "string") {
    return { valid: false, error: "Transaction type must be a string" };
  }

  if (transactionType !== "debit" && transactionType !== "credit") {
    return { valid: false, error: "Transaction type must be 'debit', 'credit', or null" };
  }

  return { valid: true };
};
