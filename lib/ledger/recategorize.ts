export type RecategorizeRow =
  | { kind: "transaction"; type: "debit" | "credit" }
  | { kind: "transfer" };

export type RecategorizeCategory = {
  id: number;
  transactionType: "debit" | "credit" | null;
};

const categoryAcceptsRow = (
  transactionType: "debit" | "credit" | null,
  row: RecategorizeRow
): boolean => {
  if (row.kind === "transfer") {
    return transactionType === null;
  }
  if (transactionType === null) {
    return true;
  }
  return transactionType === row.type;
};

export const legalCategoryIds = (
  rows: RecategorizeRow[],
  categories: RecategorizeCategory[]
): number[] => {
  if (rows.length === 0) {
    return [];
  }

  return categories
    .filter((category) => rows.every((row) => categoryAcceptsRow(category.transactionType, row)))
    .map((category) => category.id);
};
