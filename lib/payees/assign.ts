import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { cleanPayee } from "./normalize";

type BooksDb = BetterSQLite3Database<typeof schema>;

export const resolvePayeeId = (
  db: BooksDb,
  rawName: string | null | undefined
): string | null => {
  const cleaned = cleanPayee(rawName);
  if (!cleaned) return null;

  const existing = db
    .select()
    .from(schema.payees)
    .where(eq(schema.payees.normalizedName, cleaned.normalizedName))
    .get();
  if (existing) return existing.id;

  const id = randomUUID();
  const now = new Date();
  db.insert(schema.payees)
    .values({
      id,
      name: cleaned.displayName,
      normalizedName: cleaned.normalizedName,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
};
