export const inferCatalogType = (
  types: Array<"debit" | "credit">
): "debit" | "credit" | null => {
  if (types.length === 0) {
    return null;
  }

  let only: "debit" | "credit" | null = null;
  for (const type of types) {
    if (only === null) {
      only = type;
      continue;
    }
    if (type !== only) {
      return null;
    }
  }

  return only;
};
