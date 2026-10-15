// Shared with duplicate fingerprints. One normalizer for both plans.
export const normalizeDescription = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
