import { randomUUID } from "crypto";
import type Database from "better-sqlite3-multiple-ciphers";
import { cleanPayee } from "./normalize";

type Sqlite = InstanceType<typeof Database>;

export const ensurePayeesSchema = (sqlite: Sqlite): void => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const payeeColumns = sqlite.prepare("PRAGMA table_info(payees)").all() as Array<{ name: string }>;
  if (!payeeColumns.some((column) => column.name === "icon")) {
    sqlite.exec("ALTER TABLE payees ADD COLUMN icon TEXT");
  }

  const columns = sqlite.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "payee_id")) {
    sqlite.exec(
      "ALTER TABLE transactions ADD COLUMN payee_id TEXT REFERENCES payees(id) ON DELETE SET NULL"
    );
  }
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_transactions_payee_id ON transactions(payee_id)");

  const pending = sqlite
    .prepare(
      `SELECT id, description FROM transactions
       WHERE payee_id IS NULL AND description IS NOT NULL AND trim(description) != ''`
    )
    .all() as Array<{ id: string; description: string }>;

  const findPayee = sqlite.prepare("SELECT id FROM payees WHERE normalized_name = ?");
  const insertPayee = sqlite.prepare(
    "INSERT INTO payees (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  const linkTransaction = sqlite.prepare("UPDATE transactions SET payee_id = ? WHERE id = ?");
  const now = Math.floor(Date.now() / 1000);

  for (const row of pending) {
    const cleaned = cleanPayee(row.description);
    if (!cleaned) continue;

    const existing = findPayee.get(cleaned.normalizedName) as { id: string } | undefined;
    const payeeId = existing?.id ?? randomUUID();
    if (!existing) {
      insertPayee.run(payeeId, cleaned.displayName, cleaned.normalizedName, now, now);
    }
    linkTransaction.run(payeeId, row.id);
  }
};
