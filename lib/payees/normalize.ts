const TRAILING_REFERENCE = /^(?:\d+|#\d+|\*\d+)$/;

export type CleanedPayee = {
  displayName: string;
  normalizedName: string;
};

// Folds case and whitespace, then drops one trailing store or reference token.
// Internal stars stay so Uber Trip and Uber Eats differ. Duplicate checks do not use this.
export const cleanPayee = (input: string | null | undefined): CleanedPayee | null => {
  if (input == null) return null;
  const collapsed = input.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;

  const tokens = collapsed.split(" ");
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && TRAILING_REFERENCE.test(last)) {
    tokens.pop();
  }

  const displayName = tokens.join(" ").trim();
  if (!displayName) return null;

  return {
    displayName,
    normalizedName: displayName.toLowerCase(),
  };
};
