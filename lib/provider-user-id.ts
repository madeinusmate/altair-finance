import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// A random id for this install, stored only in the encrypted database.
// Bank providers see this value. They never see the passphrase or a hash of it.
export const getProviderUserId = (encryptionKey: string): string => {
  const db = getDb(encryptionKey);
  const row = db
    .select({ installId: schema.userSettings.installId })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.id, "user"))
    .get();

  if (row?.installId) return row.installId;

  const installId = randomUUID();
  if (row) {
    db.update(schema.userSettings)
      .set({ installId })
      .where(eq(schema.userSettings.id, "user"))
      .run();
    return installId;
  }

  const now = new Date();
  db.insert(schema.userSettings)
    .values({
      id: "user",
      username: "local",
      installId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return installId;
};
