import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { isValidTransactionCategoryForType } from "@/lib/db/category-helpers";
import { normalizeDescription } from "@/lib/import/normalize";

type RuleTransactionType = "debit" | "credit" | null;

const readRuleTransactionType = (value: unknown): RuleTransactionType | "invalid" => {
  if (value === undefined || value === null || value === "" || value === "both") return null;
  if (value === "debit" || value === "credit") return value;
  return "invalid";
};

const ruleIsBroken = (
  rule: { categoryName: string; transactionType: string | null },
  categories: ReadonlyArray<{ name: string; transactionType: string | null }>
): boolean => {
  const category = categories.find((item) => item.name === rule.categoryName);
  if (!category || category.name === "Transfer") return true;
  if (rule.transactionType === "debit" || rule.transactionType === "credit") {
    if (category.transactionType === null) return false;
    return category.transactionType !== rule.transactionType;
  }
  return false;
};

const presentRule = (
  rule: typeof schema.categorizationRules.$inferSelect,
  categories: ReadonlyArray<{ name: string; transactionType: string | null }>
) => ({
  ...rule,
  broken: ruleIsBroken(rule, categories),
});

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);
    const categories = db.select().from(schema.transactionCategories).all();
    const rules = db
      .select()
      .from(schema.categorizationRules)
      .orderBy(asc(schema.categorizationRules.pattern))
      .all();

    return NextResponse.json({
      rules: rules.map((rule) => presentRule(rule, categories)),
    });
  } catch {
    console.error("Error fetching categorization rules");
    return NextResponse.json({ error: "Failed to fetch categorization rules" }, { status: 500 });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const source =
      typeof body?.pattern === "string" && body.pattern.trim()
        ? body.pattern
        : typeof body?.description === "string"
          ? body.description
          : "";
    const pattern = normalizeDescription(source);
    if (!pattern) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const transactionType = readRuleTransactionType(body?.transactionType);
    if (transactionType === "invalid") {
      return NextResponse.json({ error: "Transaction type must be debit, credit, or both" }, { status: 400 });
    }

    const categoryName = typeof body?.categoryName === "string" ? body.categoryName.trim() : "";
    if (!categoryName) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }
    if (categoryName === "Transfer") {
      return NextResponse.json({ error: "Transfer is not a rule category" }, { status: 400 });
    }

    const db = getDb(key);
    const allowedForDebit = isValidTransactionCategoryForType(db, categoryName, "debit");
    const allowedForCredit = isValidTransactionCategoryForType(db, categoryName, "credit");
    if (transactionType === "debit" && !allowedForDebit) {
      return NextResponse.json({ error: "Category is not valid for debit" }, { status: 400 });
    }
    if (transactionType === "credit" && !allowedForCredit) {
      return NextResponse.json({ error: "Category is not valid for credit" }, { status: 400 });
    }
    if (transactionType === null && !allowedForDebit && !allowedForCredit) {
      return NextResponse.json({ error: "Category is not valid" }, { status: 400 });
    }

    const now = new Date();
    const categories = db.select().from(schema.transactionCategories).all();
    const typeClause =
      transactionType === null
        ? isNull(schema.categorizationRules.transactionType)
        : eq(schema.categorizationRules.transactionType, transactionType);

    const writeRule = () => {
      const current = db
        .select()
        .from(schema.categorizationRules)
        .where(and(eq(schema.categorizationRules.pattern, pattern), typeClause))
        .get();

      if (current) {
        db.update(schema.categorizationRules)
          .set({
            categoryName,
            matchType: "exact",
            updatedAt: now,
          })
          .where(eq(schema.categorizationRules.id, current.id))
          .run();
        return {
          created: false,
          rule: db
            .select()
            .from(schema.categorizationRules)
            .where(eq(schema.categorizationRules.id, current.id))
            .get(),
        };
      }

      const id = uuidv4();
      db.insert(schema.categorizationRules)
        .values({
          id,
          pattern,
          matchType: "exact",
          categoryName,
          transactionType,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return {
        created: true,
        rule: db.select().from(schema.categorizationRules).where(eq(schema.categorizationRules.id, id)).get(),
      };
    };

    let saved: ReturnType<typeof writeRule>;
    try {
      saved = writeRule();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("UNIQUE")) throw error;
      saved = writeRule();
    }

    const bodyRule = saved.rule ? presentRule(saved.rule, categories) : null;
    return NextResponse.json({ rule: bodyRule }, { status: saved.created ? 201 : 200 });
  } catch {
    console.error("Error saving categorization rule");
    return NextResponse.json({ error: "Failed to save categorization rule" }, { status: 500 });
  }
};

export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
    }

    const db = getDb(key);
    const existing = db
      .select()
      .from(schema.categorizationRules)
      .where(eq(schema.categorizationRules.id, id))
      .get();
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    db.delete(schema.categorizationRules).where(eq(schema.categorizationRules.id, id)).run();
    return NextResponse.json({ success: true });
  } catch {
    console.error("Error deleting categorization rule");
    return NextResponse.json({ error: "Failed to delete categorization rule" }, { status: 500 });
  }
};
