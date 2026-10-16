import { eq } from "drizzle-orm";
import { type SupportedCurrency, isSupportedCurrency } from "@/lib/currencies";
import { schema, type getDb } from "@/lib/db";
import { convertAmount, type FxSnapshot } from "@/lib/fx";
import { monthBounds, paceForMonth, resolveMonthBudget, type BudgetPace } from "@/lib/budget/resolve-month";
import { spendForMonth } from "@/lib/budget/spend-for-month";

type Db = ReturnType<typeof getDb>;

export type MonthBudgetRow = {
  id: string | null;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  overAmount: number;
  percentageUsed: number;
  isOverBudget: boolean;
  inherited: boolean;
  inheritedFrom: string | null;
  pace: BudgetPace | null;
};

export type UnbudgetedSpend = {
  categoryId: number;
  categoryName: string;
  spent: number;
};

export type MonthBudgetSummary = {
  budgets: MonthBudgetRow[];
  unbudgeted: UnbudgetedSpend[];
  unbudgetedSpent: number;
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  month: string;
  pace: BudgetPace | null;
};

export const loadMonthBudget = (
  db: Db,
  yearMonth: string,
  currency: SupportedCurrency,
  fxSnapshot: FxSnapshot,
  now: Date = new Date()
): MonthBudgetSummary => {
  const bounds = monthBounds(yearMonth);
  if (!bounds) {
    throw new Error("Invalid yearMonth");
  }

  const spentByCategory = spendForMonth(db, bounds.start, bounds.end, currency, fxSnapshot);
  const debitCategories = db
    .select()
    .from(schema.transactionCategories)
    .where(eq(schema.transactionCategories.transactionType, "debit"))
    .all();
  const budgetRows = db.select().from(schema.budgets).all();

  const rowsByCategory = new Map<number, Array<{ id: string; yearMonth: string; amount: number; currency: string }>>();
  for (const row of budgetRows) {
    if (row.categoryId == null || !row.yearMonth) {
      continue;
    }
    const list = rowsByCategory.get(row.categoryId) ?? [];
    list.push({
      id: row.id,
      yearMonth: row.yearMonth,
      amount: row.amount,
      currency: row.currency,
    });
    rowsByCategory.set(row.categoryId, list);
  }

  const budgets: MonthBudgetRow[] = [];
  const unbudgeted: UnbudgetedSpend[] = [];
  let overallBudget = 0;
  let budgetedSpent = 0;
  let unbudgetedSpent = 0;

  const categories = debitCategories.toSorted((left, right) => left.name.localeCompare(right.name));

  for (const category of categories) {
    const spent = spentByCategory.get(category.id) ?? 0;
    const resolved = resolveMonthBudget(rowsByCategory.get(category.id) ?? [], yearMonth);

    if (!resolved) {
      unbudgetedSpent += spent;
      if (spent !== 0) {
        unbudgeted.push({
          categoryId: category.id,
          categoryName: category.name,
          spent,
        });
      }
      continue;
    }

    let amount = resolved.amount;
    if (resolved.currency !== currency && isSupportedCurrency(resolved.currency)) {
      try {
        amount = convertAmount(resolved.amount, resolved.currency, currency, fxSnapshot.rates);
      } catch {
        console.error("Error converting budget amount");
      }
    }

    const remaining = Math.max(0, amount - spent);
    const overAmount = Math.max(0, spent - amount);
    const percentageUsed = amount > 0 ? (spent / amount) * 100 : 0;

    budgets.push({
      id: resolved.id,
      categoryId: category.id,
      categoryName: category.name,
      amount,
      currency,
      spent,
      remaining,
      overAmount,
      percentageUsed,
      isOverBudget: spent > amount,
      inherited: resolved.inherited,
      inheritedFrom: resolved.inheritedFrom,
      pace: paceForMonth({ amount, spent, yearMonth, now }),
    });

    overallBudget += amount;
    budgetedSpent += spent;
  }

  const overallSpent = budgetedSpent + unbudgetedSpent;
  const overallRemaining = overallBudget - overallSpent;
  const overallPercentageUsed = overallBudget > 0 ? (overallSpent / overallBudget) * 100 : 0;

  return {
    budgets,
    unbudgeted,
    unbudgetedSpent,
    overallBudget,
    overallSpent,
    overallRemaining,
    overallPercentageUsed,
    currency,
    month: yearMonth,
    pace: paceForMonth({ amount: overallBudget, spent: overallSpent, yearMonth, now }),
  };
};
