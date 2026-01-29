import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";

// GET all imports with optional filtering
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "transactions" | "balances" | null;

    const db = getDb(key);

    let imports;
    if (type && (type === "transactions" || type === "balances")) {
      imports = db
        .select()
        .from(schema.imports)
        .where(eq(schema.imports.type, type))
        .orderBy(desc(schema.imports.createdAt))
        .all();
    } else {
      imports = db
        .select()
        .from(schema.imports)
        .orderBy(desc(schema.imports.createdAt))
        .all();
    }

    return NextResponse.json({ imports });
  } catch (error) {
    console.error("Error fetching imports:", error);
    return NextResponse.json({ error: "Failed to fetch imports" }, { status: 500 });
  }
};
