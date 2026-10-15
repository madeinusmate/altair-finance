import { randomUUID } from "crypto";
import type Database from "better-sqlite3-multiple-ciphers";
import { bundledPayees } from "./bundle";
import { PAYEE_LOGO_PREFIX } from "./catalog";
import { normalizePayeeIconImage } from "./icon-image";

const DEFAULTS_META_ID = "payee_defaults_v1";
const BUNDLE_META_ID = "payee_bundle_v2";

type Sqlite = InstanceType<typeof Database>;

// Insert the bundled payees once. Later deletes stay deleted. A payee that
// already exists keeps its name, and receives a logo only when it has none.
// payee_bundle_v2 adds brands that were not in the original logo set and fills
// a missing image when the row still uses the bundled icon.
export const seedDefaultPayees = (sqlite: Sqlite): void => {
  const now = Math.floor(Date.now() / 1000);
  const seeded = sqlite.prepare("SELECT id FROM meta WHERE id = ?").get(DEFAULTS_META_ID);
  const bundled = sqlite.prepare("SELECT id FROM meta WHERE id = ?").get(BUNDLE_META_ID);
  if (seeded && bundled) return;

  const find = sqlite.prepare("SELECT id, icon, icon_image FROM payees WHERE normalized_name = ?");
  const insert = sqlite.prepare(
    `INSERT INTO payees (id, name, normalized_name, icon, icon_image, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const attachLogo = sqlite.prepare(
    `UPDATE payees SET icon = ?, icon_image = ?, updated_at = ? WHERE id = ? AND icon IS NULL AND icon_image IS NULL`
  );
  const fillImage = sqlite.prepare(
    `UPDATE payees SET icon_image = ?, updated_at = ? WHERE id = ? AND icon_image IS NULL`
  );

  for (const payee of bundledPayees()) {
    const image = payee.image ? normalizePayeeIconImage(payee.image) : null;
    const existing = find.get(payee.normalizedName) as
      | { id: string; icon: string | null; icon_image: string | null }
      | undefined;
    if (!existing) {
      if (seeded && payee.icon?.startsWith(PAYEE_LOGO_PREFIX)) continue;
      insert.run(randomUUID(), payee.name, payee.normalizedName, payee.icon, image, now, now);
      continue;
    }
    if (!existing.icon && !existing.icon_image) {
      attachLogo.run(payee.icon, image, now, existing.id);
      continue;
    }
    if (image && !existing.icon_image && existing.icon === payee.icon) {
      fillImage.run(image, now, existing.id);
    }
  }

  if (!seeded) {
    sqlite.prepare("INSERT INTO meta (id, schema_version, created_at) VALUES (?, 1, ?)").run(DEFAULTS_META_ID, now);
  }
  if (!bundled) {
    sqlite.prepare("INSERT INTO meta (id, schema_version, created_at) VALUES (?, 1, ?)").run(BUNDLE_META_ID, now);
  }
};
