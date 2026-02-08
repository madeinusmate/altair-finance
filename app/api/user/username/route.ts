import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/api-utils";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  return withDb(request, async (db) => {
    const user = await db.select().from(userSettings).where(eq(userSettings.id, "user")).limit(1);
    
    if (user.length === 0) {
      return NextResponse.json({ username: null });
    }
    
    return { username: user[0].username };
  });
};
