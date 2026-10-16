import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { bundledPayee } from "./bundle";
import { cleanPayee } from "./normalize";
import { normalizePayeeIconImage } from "./icon-image";

type BooksDb = BetterSQLite3Database<typeof schema>;

export const payeeDraft = (
  rawName: string | null | undefined,
  icon?: string | null
): { name: string; normalizedName: string; icon: string | null; image: string | null } | null => {
  const cleaned = cleanPayee(rawName);
  if (!cleaned) return null;
  const preset = bundledPayee(cleaned.normalizedName);
  const explicitIcon = typeof icon === "string" && icon.trim() ? icon.trim() : null;
  return {
    name: preset?.name ?? cleaned.displayName,
    normalizedName: cleaned.normalizedName,
    icon: explicitIcon ?? preset?.icon ?? null,
    image: explicitIcon ? null : (preset?.image ?? null),
  };
};

export const resolvePayeeId = (
  db: BooksDb,
  rawName: string | null | undefined,
  icon?: string | null,
  iconImage?: string | null
): string | null => {
  const draft = payeeDraft(rawName, icon);
  if (!draft) return null;

  const existing = db
    .select()
    .from(schema.payees)
    .where(eq(schema.payees.normalizedName, draft.normalizedName))
    .get();
  if (existing) return existing.id;

  const id = randomUUID();
  const now = new Date();
  db.insert(schema.payees)
    .values({
      id,
      name: draft.name,
      normalizedName: draft.normalizedName,
      icon: draft.icon,
      iconImage: normalizePayeeIconImage(iconImage ?? draft.image),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
};
