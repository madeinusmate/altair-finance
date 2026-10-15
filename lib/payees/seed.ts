import { randomUUID } from "crypto";
import type Database from "better-sqlite3-multiple-ciphers";
import { defaultPayees } from "./catalog";

const DEFAULTS_META_ID = "payee_defaults_v1";

type Sqlite = InstanceType<typeof Database>;

// Insert the bundled payees once. Later deletes stay deleted. A payee that
// already exists keeps its name, and receives a logo only when it has none.
export const seedDefaultPayees = (sqlite: Sqlite): void => {
  const alreadySeeded = sqlite.prepare("SELECT id FROM meta WHERE id = ?").get(DEFAULTS_META_ID);
  if (alreadySeeded) return;

  const now = Math.floor(Date.now() / 1000);
  const find = sqlite.prepare("SELECT id, icon, icon_image FROM payees WHERE normalized_name = ?");
  const insert = sqlite.prepare(
    `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
  );
  const attachLogo = sqlite.prepare(
    `UPDATE payees SET icon = ?, updated_at = ? WHERE id = ? AND icon IS NULL AND icon_image IS NULL`
  );

  for (const payee of defaultPayees()) {
    const existing = find.get(payee.normalizedName) as
      | { id: string; icon: string | null; icon_image: string | null }
      | undefined;
    if (!existing) {
      insert.run(randomUUID(), payee.name, payee.normalizedName, payee.icon, now, now);
      continue;
    }
    if (!existing.icon && !existing.icon_image) {
      attachLogo.run(payee.icon, now, existing.id);
    }
  }

  sqlite.prepare("INSERT INTO meta (id, schema_version, created_at) VALUES (?, 1, ?)").run(DEFAULTS_META_ID, now);
};
