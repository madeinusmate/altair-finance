import Database from "better-sqlite3-multiple-ciphers";
import { anchorBudgetYearMonth } from "@/lib/budget/resolve-month";

type DatabaseInstance = InstanceType<typeof Database>;

const tableExists = (sqlite: DatabaseInstance, table: string): boolean => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return !!row;
};

export const ensureBudgetMonths = (sqlite: DatabaseInstance): void => {
  if (!tableExists(sqlite, "budgets")) {
    return;
  }

  const run = sqlite.transaction(() => {
    const columns = sqlite.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("category_id")) {
      throw new Error("ensureBudgetMonths requires budgets.category_id");
    }
    if (!names.has("year_month")) {
      sqlite.exec("ALTER TABLE budgets ADD COLUMN year_month TEXT");
    }

    const duplicateCategories = sqlite
      .prepare(
        `SELECT category_id AS categoryId
         FROM budgets
         WHERE year_month IS NULL AND category_id IS NOT NULL
         GROUP BY category_id
         HAVING COUNT(*) > 1`
      )
      .all() as Array<{ categoryId: number }>;

    const listDuplicates = sqlite.prepare(
      `SELECT id, amount, updated_at AS updatedAt, rowid
       FROM budgets
       WHERE category_id = ? AND year_month IS NULL
       ORDER BY updated_at DESC, rowid DESC`
    );
    const deleteBudget = sqlite.prepare("DELETE FROM budgets WHERE id = ?");

    for (const duplicate of duplicateCategories) {
      const rows = listDuplicates.all(duplicate.categoryId) as Array<{
        id: string;
        amount: number;
        updatedAt: number;
        rowid: number;
      }>;
      for (const drop of rows.slice(1)) {
        console.log(
          `[DB Migration] Dropping duplicate budget id=${drop.id} amount=${drop.amount} category_id=${duplicate.categoryId}`
        );
        deleteBudget.run(drop.id);
      }
    }

    const pending = sqlite
      .prepare("SELECT id, created_at AS createdAt FROM budgets WHERE year_month IS NULL")
      .all() as Array<{ id: string; createdAt: number }>;
    const now = new Date();
    const setMonth = sqlite.prepare("UPDATE budgets SET year_month = ? WHERE id = ?");
    for (const row of pending) {
      setMonth.run(anchorBudgetYearMonth(row.createdAt, now), row.id);
    }

    try {
      sqlite.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category_month ON budgets(category_id, year_month)"
      );
    } catch (error) {
      console.error("[DB Migration] Failed to create idx_budgets_category_month", error);
      throw new Error("Duplicate category and month budgets remain; idx_budgets_category_month was not created");
    }
  });

  run();
};
