import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getEncryptionKey } from "@/lib/api-utils";
import { getDb, schema } from "@/lib/db";
import { parsePdfLocally } from "@/lib/pdf/local-parser";
import { validatePdfFile } from "@/lib/pdf/types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const accountId = formData.get("accountId") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided", retryable: false },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "Account ID is required", retryable: false },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validatePdfFile(file);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid file", retryable: false },
        { status: 400 }
      );
    }

    // Verify account exists and is a transaction account
    const db = getDb(key);
    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
    
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found", retryable: false },
        { status: 404 }
      );
    }

    if (account.type !== "transaction") {
      return NextResponse.json(
        { success: false, error: "Transactions can only be imported to transaction accounts", retryable: false },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await parsePdfLocally(bytes, {
      filename: file.name,
      fileSize: bytes.byteLength,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("PDF parse failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse PDF",
        retryable: true,
      },
      { status: 500 }
    );
  }
};
