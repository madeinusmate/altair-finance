import Database from "better-sqlite3-multiple-ciphers";
import { inferCatalogType } from "@/lib/db/category-identity";

type DatabaseInstance = InstanceType<typeof Database>;

type TableInfo = { name: string };

type ForeignKeyViolation = {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
};

const tableExists = (sqlite: DatabaseInstance, table: string): boolean => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return !!row;
};

const columnNames = (sqlite: DatabaseInstance, table: string): Set<string> => {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as TableInfo[];
  return new Set(columns.map((column) => column.name));
};

const addCategoryIdColumn = (sqlite: DatabaseInstance, table: string): void => {
  if (!tableExists(sqlite, table)) {
    return;
  }
  if (columnNames(sqlite, table).has("category_id")) {
    return;
  }
  sqlite.exec(
    `ALTER TABLE ${table} ADD COLUMN category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT`
  );
};

export const ensureCategoryIds = (sqlite: DatabaseInstance): void => {
  const run = sqlite.transaction(() => {
    if (!tableExists(sqlite, "transactions")) {
      return;
    }

    addCategoryIdColumn(sqlite, "transactions");
    addCategoryIdColumn(sqlite, "transfers");
    addCategoryIdColumn(sqlite, "budgets");

    const existingViolations = sqlite.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
    for (const violation of existingViolations) {
      if (violation.parent === "transaction_categories") {
        continue;
      }
      console.warn(
        `[DB Migration] Pre-existing foreign key violation table=${violation.table} rowid=${violation.rowid} parent=${violation.parent} fkid=${violation.fkid}`
      );
    }

    if (tableExists(sqlite, "transfers") && columnNames(sqlite, "transfers").has("category")) {
      sqlite.exec("UPDATE transfers SET category = 'Transfer' WHERE category IS NULL");
    }

    const catalog = sqlite.prepare("SELECT id, name FROM transaction_categories").all() as Array<{
      id: number;
      name: string;
    }>;
    const knownNames = new Set(catalog.map((row) => row.name));

    const missingNames = new Set<string>();
    const collectNames = (sql: string) => {
      const rows = sqlite.prepare(sql).all() as Array<{ name: string | null }>;
      for (const row of rows) {
        if (row.name != null && !knownNames.has(row.name)) {
          missingNames.add(row.name);
        }
      }
    };

    collectNames("SELECT DISTINCT category AS name FROM transactions WHERE category IS NOT NULL");
    if (tableExists(sqlite, "transfers") && columnNames(sqlite, "transfers").has("category")) {
      collectNames("SELECT DISTINCT category AS name FROM transfers WHERE category IS NOT NULL");
    }
    if (tableExists(sqlite, "budgets") && columnNames(sqlite, "budgets").has("category_name")) {
      collectNames("SELECT DISTINCT category_name AS name FROM budgets WHERE category_name IS NOT NULL");
    }

    const now = Math.floor(Date.now() / 1000);
    const insertCategory = sqlite.prepare(
      "INSERT INTO transaction_categories (name, transaction_type, created_at, updated_at) VALUES (?, ?, ?, ?)"
    );
    const typesForName = sqlite.prepare("SELECT DISTINCT type FROM transactions WHERE category = ?");

    for (const name of missingNames) {
      const typeRows = typesForName.all(name) as Array<{ type: string }>;
      const types = typeRows
        .map((row) => row.type)
        .filter((type): type is "debit" | "credit" => type === "debit" || type === "credit");
      insertCategory.run(name, inferCatalogType(types), now, now);
    }

    sqlite.exec(`
      UPDATE transactions
      SET category_id = (
        SELECT id FROM transaction_categories WHERE name = transactions.category
      )
      WHERE category_id IS NULL
    `);

    if (tableExists(sqlite, "transfers") && columnNames(sqlite, "transfers").has("category_id")) {
      sqlite.exec(`
        UPDATE transfers
        SET category_id = (
          SELECT id FROM transaction_categories WHERE name = transfers.category
        )
        WHERE category_id IS NULL
      `);
    }

    if (tableExists(sqlite, "budgets") && columnNames(sqlite, "budgets").has("category_id")) {
      sqlite.exec(`
        UPDATE budgets
        SET category_id = (
          SELECT id FROM transaction_categories WHERE name = budgets.category_name
        )
        WHERE category_id IS NULL
      `);
    }

    const nullCount = (sql: string): number => {
      const row = sqlite.prepare(sql).get() as { count: number };
      return Number(row.count);
    };

    if (nullCount("SELECT COUNT(*) AS count FROM transactions WHERE category_id IS NULL") > 0) {
      throw new Error("Category identity backfill left transactions without category_id");
    }
    if (
      tableExists(sqlite, "transfers") &&
      columnNames(sqlite, "transfers").has("category_id") &&
      nullCount("SELECT COUNT(*) AS count FROM transfers WHERE category_id IS NULL") > 0
    ) {
      throw new Error("Category identity backfill left transfers without category_id");
    }
    if (
      tableExists(sqlite, "budgets") &&
      columnNames(sqlite, "budgets").has("category_id") &&
      nullCount("SELECT COUNT(*) AS count FROM budgets WHERE category_id IS NULL") > 0
    ) {
      throw new Error("Category identity backfill left budgets without category_id");
    }

    const violations = sqlite.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
    const categoryViolations = violations.filter((row) => row.parent === "transaction_categories");
    if (categoryViolations.length > 0) {
      console.error("[DB Migration] category_id foreign key violations", categoryViolations);
      throw new Error("category_id points at a missing category");
    }

    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id)");
    if (tableExists(sqlite, "transfers")) {
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transfers_category_id ON transfers(category_id)");
    }
    if (tableExists(sqlite, "budgets")) {
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id)");
    }
  });

  run();
};
