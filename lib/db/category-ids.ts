import { inferCatalogType } from "./category-identity";

interface Statement {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): unknown;
}

export interface CategoryMigrationDb {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
}

interface TableColumn {
  name: string;
}

interface CountRow {
  count: number;
}

interface NameRow {
  name: string | null;
}

interface IdNameRow {
  id: number;
  name: string;
}

interface TypeRow {
  type: string | null;
}

interface ForeignKeyViolation {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
}

const tableExists = (sqlite: CategoryMigrationDb, table: string): boolean => {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined;
  return !!row;
};

const columnNames = (sqlite: CategoryMigrationDb, table: string): Set<string> => {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as TableColumn[];
  return new Set(columns.map((column) => column.name));
};

const countNullCategoryIds = (sqlite: CategoryMigrationDb, table: string): number => {
  const row = sqlite
    .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE category_id IS NULL`)
    .get() as CountRow;
  return Number(row.count);
};

const countMissingCatalogRows = (sqlite: CategoryMigrationDb, table: string): number => {
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) as count FROM ${table}
       WHERE category_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM transaction_categories WHERE transaction_categories.id = ${table}.category_id
       )`
    )
    .get() as CountRow;
  return Number(row.count);
};

const logPreexistingViolations = (sqlite: CategoryMigrationDb): void => {
  const violations = sqlite.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
  for (const violation of violations) {
    if (violation.parent === "transaction_categories") {
      continue;
    }
    console.warn(
      `[DB Migration] Pre-existing foreign key violation table=${violation.table} rowid=${violation.rowid} parent=${violation.parent} fkid=${violation.fkid}`
    );
  }
};

const assertCategoryForeignKeys = (sqlite: CategoryMigrationDb): void => {
  const violations = sqlite.prepare("PRAGMA foreign_key_check").all() as ForeignKeyViolation[];
  const categoryViolations = violations.filter((violation) => violation.parent === "transaction_categories");
  if (categoryViolations.length > 0) {
    throw new Error(
      `Category migration left ${categoryViolations.length} category_id foreign key violation(s)`
    );
  }

  const tables = ["transactions", "transfers", "budgets"] as const;
  for (const table of tables) {
    if (!tableExists(sqlite, table) || !columnNames(sqlite, table).has("category_id")) {
      continue;
    }
    const missing = countMissingCatalogRows(sqlite, table);
    if (missing > 0) {
      throw new Error(`Category migration left ${missing} ${table}.category_id values without a catalog row`);
    }
  }
};

export const ensureCategoryIds = (sqlite: CategoryMigrationDb): void => {
  if (!tableExists(sqlite, "transactions")) {
    return;
  }

  // Account and import foreign keys may already be violated. Those rows still need a
  // category id. foreign_keys cannot change inside a transaction, so turn enforcement
  // off for this backfill only, then restore it. Category ids are checked explicitly.
  const foreignKeyRow = sqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number } | undefined;
  const restoreForeignKeys = Number(foreignKeyRow?.foreign_keys) === 1;
  if (restoreForeignKeys) {
    sqlite.exec("PRAGMA foreign_keys = OFF");
  }

  const migrate = sqlite.transaction(() => {
    if (tableExists(sqlite, "transaction_categories")) {
      const categoryColumns = columnNames(sqlite, "transaction_categories");
      if (!categoryColumns.has("transaction_type")) {
        sqlite.exec("ALTER TABLE transaction_categories ADD COLUMN transaction_type TEXT");
      }
    }

    const tables: Array<{ table: "transactions" | "transfers" | "budgets"; nameColumn: string }> = [
      { table: "transactions", nameColumn: "category" },
      { table: "transfers", nameColumn: "category" },
      { table: "budgets", nameColumn: "category_name" },
    ];

    for (const { table } of tables) {
      if (!tableExists(sqlite, table)) {
        continue;
      }
      const names = columnNames(sqlite, table);
      if (!names.has("category_id")) {
        sqlite.exec(
          `ALTER TABLE ${table} ADD COLUMN category_id INTEGER REFERENCES transaction_categories(id) ON DELETE RESTRICT`
        );
      }
    }

    logPreexistingViolations(sqlite);

    if (!tableExists(sqlite, "transaction_categories")) {
      throw new Error("Category migration requires transaction_categories");
    }

    const catalog = sqlite
      .prepare("SELECT id, name FROM transaction_categories")
      .all() as IdNameRow[];
    const nameToId = new Map(catalog.map((row) => [row.name, row.id]));

    const missingNames = new Set<string>();
    const collectNames = (sql: string) => {
      const rows = sqlite.prepare(sql).all() as NameRow[];
      for (const row of rows) {
        if (row.name == null || nameToId.has(row.name)) {
          continue;
        }
        missingNames.add(row.name);
      }
    };

    if (columnNames(sqlite, "transactions").has("category") && columnNames(sqlite, "transactions").has("category_id")) {
      collectNames(
        "SELECT DISTINCT category AS name FROM transactions WHERE category IS NOT NULL AND category_id IS NULL"
      );
    }
    if (
      tableExists(sqlite, "transfers") &&
      columnNames(sqlite, "transfers").has("category") &&
      columnNames(sqlite, "transfers").has("category_id")
    ) {
      collectNames(
        "SELECT DISTINCT COALESCE(category, 'Transfer') AS name FROM transfers WHERE category_id IS NULL"
      );
    }
    if (
      tableExists(sqlite, "budgets") &&
      columnNames(sqlite, "budgets").has("category_name") &&
      columnNames(sqlite, "budgets").has("category_id")
    ) {
      collectNames(
        "SELECT DISTINCT category_name AS name FROM budgets WHERE category_name IS NOT NULL AND category_id IS NULL"
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const insertCategory = sqlite.prepare(
      "INSERT INTO transaction_categories (name, transaction_type, created_at, updated_at) VALUES (?, ?, ?, ?)"
    );
    const transactionsHaveCategory = columnNames(sqlite, "transactions").has("category");
    const typesForName = transactionsHaveCategory
      ? sqlite.prepare("SELECT DISTINCT type AS type FROM transactions WHERE category = ?")
      : null;

    for (const name of missingNames) {
      const typeRows = typesForName ? (typesForName.all(name) as TypeRow[]) : [];
      const types = typeRows
        .map((row) => row.type)
        .filter((type): type is "debit" | "credit" => type === "debit" || type === "credit");
      insertCategory.run(name, inferCatalogType(types), now, now);
    }

    if (columnNames(sqlite, "transactions").has("category") && columnNames(sqlite, "transactions").has("category_id")) {
      sqlite.exec(`
        UPDATE transactions
        SET category_id = (
          SELECT id FROM transaction_categories WHERE name = transactions.category
        )
        WHERE category_id IS NULL
      `);
    }

    if (
      tableExists(sqlite, "transfers") &&
      columnNames(sqlite, "transfers").has("category") &&
      columnNames(sqlite, "transfers").has("category_id")
    ) {
      sqlite.exec(`
        UPDATE transfers
        SET category_id = (
          SELECT id FROM transaction_categories WHERE name = COALESCE(transfers.category, 'Transfer')
        )
        WHERE category_id IS NULL
      `);
    }

    if (
      tableExists(sqlite, "budgets") &&
      columnNames(sqlite, "budgets").has("category_name") &&
      columnNames(sqlite, "budgets").has("category_id")
    ) {
      sqlite.exec(`
        UPDATE budgets
        SET category_id = (
          SELECT id FROM transaction_categories WHERE name = budgets.category_name
        )
        WHERE category_id IS NULL
      `);
    }

    if (columnNames(sqlite, "transactions").has("category") && countNullCategoryIds(sqlite, "transactions") > 0) {
      throw new Error("Category migration left transactions without category_id");
    }
    if (
      tableExists(sqlite, "transfers") &&
      columnNames(sqlite, "transfers").has("category") &&
      countNullCategoryIds(sqlite, "transfers") > 0
    ) {
      throw new Error("Category migration left transfers without category_id");
    }
    if (
      tableExists(sqlite, "budgets") &&
      columnNames(sqlite, "budgets").has("category_name") &&
      countNullCategoryIds(sqlite, "budgets") > 0
    ) {
      throw new Error("Category migration left budgets without category_id");
    }

    assertCategoryForeignKeys(sqlite);

    if (columnNames(sqlite, "transactions").has("category_id")) {
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id)");
    }
    if (tableExists(sqlite, "transfers") && columnNames(sqlite, "transfers").has("category_id")) {
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transfers_category_id ON transfers(category_id)");
    }
    if (tableExists(sqlite, "budgets") && columnNames(sqlite, "budgets").has("category_id")) {
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_budgets_category_id ON budgets(category_id)");
    }
  });

  try {
    migrate();
  } finally {
    if (restoreForeignKeys) {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  }
};
