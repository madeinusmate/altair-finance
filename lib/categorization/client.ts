import { apiClient } from "@/lib/api-client";
import { normalizeDescription } from "@/lib/import/normalize";
import {
  CategoryAllowance,
  ImportLearnResult,
  LearnableRow,
  learnablePostedIndexes,
  rowQualifiesForLearn,
} from "@/lib/categorization/rules";

export const saveCategorizationRule = async (input: {
  description: string;
  categoryName: string;
  transactionType?: "debit" | "credit" | null;
}): Promise<void> => {
  if (!normalizeDescription(input.description)) return;
  if (!input.categoryName || input.categoryName === "Transfer") return;
  const transactionType = input.transactionType;
  if (
    transactionType !== undefined &&
    transactionType !== null &&
    transactionType !== "debit" &&
    transactionType !== "credit"
  ) {
    return;
  }

  await apiClient.post("/api/categorization-rules", {
    description: input.description,
    categoryName: input.categoryName,
    transactionType: input.transactionType ?? null,
  });
};

export const learnImportedRows = async (
  rows: readonly LearnableRow[],
  categories: readonly CategoryAllowance[],
  result: ImportLearnResult
): Promise<{ failed: number }> => {
  const indexes = learnablePostedIndexes(rows.length, result);
  if (!indexes || indexes.length === 0) return { failed: 0 };

  const jobs = indexes
    .map((index) => rows[index])
    .filter((row): row is LearnableRow => Boolean(row) && rowQualifiesForLearn(row, categories));

  if (jobs.length === 0) return { failed: 0 };

  let failed = 0;
  for (const row of jobs) {
    try {
      await saveCategorizationRule({
        description: row.description,
        categoryName: row.category,
        transactionType: row.type === "credit" ? "credit" : "debit",
      });
    } catch {
      failed += 1;
    }
  }

  return { failed };
};
