import { NextRequest, NextResponse } from "next/server";
import { eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { normalizePayeeIconImage, PayeeIconImageError } from "@/lib/payees/icon-image";
import { parsePayeeListQuery, payeeLikePattern } from "@/lib/payees/list-query";

const payeeNameFilter = (q: string): SQL | undefined => {
  const pattern = payeeLikePattern(q);
  if (!pattern) return undefined;
  return sql`lower(${schema.payees.name}) LIKE ${pattern} ESCAPE '\\'`;
};

const payeePageColumns = {
  id: schema.payees.id,
  name: schema.payees.name,
  normalizedName: schema.payees.normalizedName,
  icon: schema.payees.icon,
  iconImage: schema.payees.iconImage,
  transactionCount: sql<number>`(
    SELECT COUNT(*) FROM transactions WHERE transactions.payee_id = ${schema.payees.id}
  )`.as("transaction_count"),
};

const payeeSummaryColumns = {
  id: schema.payees.id,
  name: schema.payees.name,
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parsePayeeListQuery(request.nextUrl.searchParams);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const db = getDb(key);
    const filter = payeeNameFilter(parsed.q);

    if (parsed.limit === null && !parsed.summary) {
      const rows = db.select(payeePageColumns).from(schema.payees).all();
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ payees: rows });
    }

    const countQuery = db.select({ total: sql<number>`count(*)` }).from(schema.payees);
    const total = Number((filter ? countQuery.where(filter) : countQuery).get()?.total ?? 0);
    const order = sql`${schema.payees.name} COLLATE NOCASE`;
    const selected = parsed.summary
      ? db.select(payeeSummaryColumns).from(schema.payees)
      : db.select(payeePageColumns).from(schema.payees);
    const filtered = filter ? selected.where(filter) : selected;
    const ordered = filtered.orderBy(order);
    const rows = (parsed.limit === null ? ordered : ordered.limit(parsed.limit).offset(parsed.offset)).all();
    const hasMore = parsed.limit !== null && parsed.offset + rows.length < total;

    return NextResponse.json({
      payees: rows,
      total,
      offset: parsed.offset,
      limit: parsed.limit,
      hasMore,
    });
  } catch (error) {
    console.error("Error listing payees:", error);
    return NextResponse.json({ error: "Failed to list payees" }, { status: 500 });
  }
};

export const PATCH = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!id || !name) {
      return NextResponse.json({ error: "Payee id and name are required" }, { status: 400 });
    }

    const db = getDb(key);
    const existing = db.select().from(schema.payees).where(eq(schema.payees.id, id)).get();
    if (!existing) {
      return NextResponse.json({ error: "Payee not found" }, { status: 404 });
    }

    const icon =
      body?.icon === null || typeof body?.icon === "string"
        ? (typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null)
        : existing.icon;

    let iconImage = existing.iconImage;
    if (body?.iconImage === null || typeof body?.iconImage === "string") {
      try {
        iconImage = normalizePayeeIconImage(body.iconImage);
      } catch (error) {
        if (error instanceof PayeeIconImageError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }

    db.update(schema.payees)
      .set({ name, icon, iconImage, updatedAt: new Date() })
      .where(eq(schema.payees.id, id))
      .run();

    const updated = db.select().from(schema.payees).where(eq(schema.payees.id, id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error renaming payee:", error);
    return NextResponse.json({ error: "Failed to rename payee" }, { status: 500 });
  }
};
