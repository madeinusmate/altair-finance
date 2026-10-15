export const inferCatalogType = (
  types: Array<"debit" | "credit">
): "debit" | "credit" | null => {
  if (types.length === 0) {
    return null;
  }

  const distinct = new Set(types);
  if (distinct.size !== 1) {
    return null;
  }

  const only = types[0];
  if (only === "debit" || only === "credit") {
    return only;
  }

  return null;
};
