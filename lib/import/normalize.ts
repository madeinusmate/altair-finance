// Case and whitespace folding for categorization rules. Duplicate checks do not use this.
export const normalizeDescription = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
