import { and, eq, gte, lte, ne } from "drizzle-orm";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { schema, type getDb } from "@/lib/db";
import { convertAmount, type FxSnapshot } from "@/lib/fx";

type Db = ReturnType<typeof getDb>;

export const spendForMonth = (
  db: Db,
  startDate: Date,
  endDate: Date,
  targetCurrency: SupportedCurrency,
  fxSnapshot: FxSnapshot
): Map<number, number> => {
  const rows = db
    .select({
      categoryId: schema.transactions.categoryId,
      amount: schema.transactions.amount,
      accountCurrency: schema.accounts.currency,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .innerJoin(
      schema.transactionCategories,
      eq(schema.transactions.categoryId, schema.transactionCategories.id)
    )
    .where(
      and(
        eq(schema.transactions.type, "debit"),
        eq(schema.transactionCategories.transactionType, "debit"),
        gte(schema.transactions.date, startDate),
        lte(schema.transactions.date, endDate),
        ne(schema.accounts.type, "investment")
      )
    )
    .all();

  const totals = new Map<number, number>();

  for (const row of rows) {
    if (row.categoryId == null || !isSupportedCurrency(row.accountCurrency)) {
      continue;
    }

    try {
      const converted = convertAmount(row.amount, row.accountCurrency, targetCurrency, fxSnapshot.rates);
      totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + converted);
    } catch {
      console.error("Error converting transaction amount for budget spend");
    }
  }

  return totals;
};
