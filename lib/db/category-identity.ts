export type CatalogTransactionType = "debit" | "credit" | null;

export const inferCatalogType = (
  types: Array<"debit" | "credit">
): "debit" | "credit" | null => {
  if (types.length === 0) {
    return null;
  }

  const first = types[0];
  for (const type of types) {
    if (type !== first) {
      return null;
    }
  }

  return first;
};

export type CategoryUsageCounts = {
  debitTransactions: number;
  creditTransactions: number;
  transfers: number;
  budgets: number;
};

export type ReassignCategoryChoice = {
  id: number;
  transactionType: CatalogTransactionType;
  hasBudget: boolean;
};

export const legalReassignCategoryIds = (
  usage: CategoryUsageCounts,
  categories: ReassignCategoryChoice[],
  sourceId: number
): number[] => {
  const referenced =
    usage.debitTransactions + usage.creditTransactions + usage.transfers + usage.budgets > 0;
  if (!referenced) {
    return [];
  }

  return categories
    .filter((category) => category.id !== sourceId)
    .filter((category) => {
      if (
        usage.debitTransactions > 0 &&
        category.transactionType !== null &&
        category.transactionType !== "debit"
      ) {
        return false;
      }
      if (
        usage.creditTransactions > 0 &&
        category.transactionType !== null &&
        category.transactionType !== "credit"
      ) {
        return false;
      }
      if (usage.transfers > 0 && category.transactionType !== null) {
        return false;
      }
      if (usage.budgets > 0) {
        if (category.transactionType !== "debit" || category.hasBudget) {
          return false;
        }
      }
      return true;
    })
    .map((category) => category.id);
};
