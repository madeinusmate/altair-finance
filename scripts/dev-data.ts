import { randomUUID } from "crypto";
import { format, startOfMonth, subMonths } from "date-fns";
import { eq } from "drizzle-orm";
import { SUPPORTED_CURRENCIES, serializeEnabledCurrencies } from "../lib/currencies";
import { schema, type getDb } from "../lib/db/index";
import { resolvePayeeId } from "../lib/payees/assign";

type Books = ReturnType<typeof getDb>;

const CURRENCY = "SGD";
const DEV_PROFILE_EMAIL = "alex.rivera@example.com";

type AccountKey = "checking" | "savings" | "card" | "brokerage" | "cash";

type Spend = {
  day: number;
  account: "checking" | "card" | "savings";
  type: "debit" | "credit";
  category: string;
  amount: number;
  payee: string;
  description: string;
  when?: "all" | "last";
};

const SPENDING: Spend[] = [
  { day: 1, account: "checking", type: "credit", category: "Salary", amount: 8200, payee: "Northwind Studio", description: "Payroll" },
  { day: 3, account: "checking", type: "debit", category: "Rent & Utilities", amount: 2650, payee: "Harbor Property", description: "Rent" },
  { day: 5, account: "checking", type: "debit", category: "Food & Drink", amount: 78.4, payee: "Grab", description: "Dinner" },
  { day: 8, account: "checking", type: "debit", category: "Food & Drink", amount: 42.5, payee: "Starbucks", description: "Coffee" },
  { day: 9, account: "checking", type: "debit", category: "Food & Drink", amount: 63.2, payee: "Market & Co", description: "Groceries" },
  { day: 12, account: "checking", type: "debit", category: "Food & Drink", amount: 96.15, payee: "Grab", description: "Groceries delivery" },
  { day: 4, account: "checking", type: "debit", category: "Entertainment", amount: 16.99, payee: "Apple", description: "Apple Music" },
  { day: 13, account: "checking", type: "debit", category: "Health & Personal Care", amount: 32, payee: "Corner Pharmacy", description: "Pharmacy" },
  { day: 6, account: "card", type: "debit", category: "Subscriptions", amount: 22.98, payee: "Netflix", description: "Standard plan" },
  { day: 6, account: "card", type: "debit", category: "Subscriptions", amount: 11.98, payee: "Spotify", description: "Premium" },
  { day: 7, account: "card", type: "debit", category: "Auto & Transport", amount: 18.6, payee: "Grab", description: "Ride home" },
  { day: 11, account: "card", type: "debit", category: "Shopping", amount: 48, payee: "Uniqlo", description: "T-shirt" },
  { day: 14, account: "card", type: "debit", category: "Auto & Transport", amount: 64.2, payee: "Shell", description: "Fuel" },
  { day: 20, account: "card", type: "debit", category: "Shopping", amount: 186, payee: "Uniqlo", description: "Weekend shop", when: "last" },
  { day: 22, account: "card", type: "debit", category: "Shopping", amount: 310, payee: "IKEA", description: "Desk lamp", when: "last" },
  { day: 28, account: "savings", type: "credit", category: "Other Income", amount: 18.4, payee: "Harbor Bank", description: "Savings interest" },
];

const BUDGETS: Array<{ category: string; amount: number }> = [
  { category: "Food & Drink", amount: 450 },
  { category: "Rent & Utilities", amount: 2800 },
  { category: "Shopping", amount: 200 },
  { category: "Subscriptions", amount: 50 },
  { category: "Auto & Transport", amount: 150 },
  { category: "Entertainment", amount: 60 },
  { category: "Health & Personal Care", amount: 80 },
];

const onDay = (monthStart: Date, day: number, now: Date): Date | null => {
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  if (day > lastDay) return null;
  const value = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 9, 0, 0, 0);
  if (value.getTime() > now.getTime()) return null;
  return value;
};

export const seedDevData = (db: Books, now: Date = new Date()) => {
  const monthStarts = [2, 1, 0].map((offset) => startOfMonth(subMonths(now, offset)));
  const openedAt = monthStarts[0];

  db.update(schema.userSettings)
    .set({
      email: DEV_PROFILE_EMAIL,
      preferredCurrency: CURRENCY,
      enabledCurrencies: serializeEnabledCurrencies([...SUPPORTED_CURRENCIES]),
      updatedAt: now,
    })
    .where(eq(schema.userSettings.id, "user"))
    .run();

  const categories = new Map(
    db
      .select()
      .from(schema.transactionCategories)
      .all()
      .map((category) => [category.name, category])
  );
  const categoryFor = (name: string) => {
    const category = categories.get(name);
    if (!category?.id) {
      throw new Error(`Dev data is missing the ${name} category`);
    }
    return category;
  };
  const transferCategory = categoryFor("Transfer");

  const accountRows: Array<{
    key: AccountKey;
    name: string;
    type: "transaction" | "balance" | "investment";
    nature: "asset" | "liability";
    category: string;
    initialBalance: number;
    icon: string;
  }> = [
    { key: "checking", name: "Everyday Checking", type: "transaction", nature: "asset", category: "checking", initialBalance: 6400, icon: "Wallet" },
    { key: "savings", name: "Rainy Day Savings", type: "transaction", nature: "asset", category: "savings", initialBalance: 18200, icon: "PiggyBank" },
    { key: "card", name: "Harbor Visa", type: "transaction", nature: "liability", category: "credit_card", initialBalance: 0, icon: "CreditCard" },
    { key: "brokerage", name: "Index Brokerage", type: "investment", nature: "asset", category: "brokerage", initialBalance: 0, icon: "TrendingUp" },
    { key: "cash", name: "Wallet Cash", type: "balance", nature: "asset", category: "cash", initialBalance: 0, icon: "DollarSign" },
  ];

  const accountIds = new Map<AccountKey, string>();
  for (const account of accountRows) {
    const id = randomUUID();
    accountIds.set(account.key, id);
    db.insert(schema.accounts)
      .values({
        id,
        name: account.name,
        type: account.type,
        nature: account.nature,
        category: account.category,
        currency: CURRENCY,
        initialBalance: account.initialBalance,
        icon: account.icon,
        createdAt: openedAt,
        updatedAt: now,
      })
      .run();
  }

  const accountId = (key: AccountKey) => {
    const id = accountIds.get(key);
    if (!id) throw new Error(`Dev data is missing the ${key} account`);
    return id;
  };

  const payeeNames = [...new Set(SPENDING.map((line) => line.payee))];
  const payeeIds = new Map<string, string>();
  for (const name of payeeNames) {
    const id = resolvePayeeId(db, name);
    if (!id) throw new Error(`Dev data could not store payee ${name}`);
    payeeIds.set(name, id);
  }

  let transactions = 0;
  let transfers = 0;
  let contributed = 0;
  const gains = [12, 36, 68];

  monthStarts.forEach((monthStart, index) => {
    const isLastFullMonth = index === 1;
    let cardCharges = 0;

    for (const line of SPENDING) {
      if (line.when === "last" && !isLastFullMonth) continue;
      const date = onDay(monthStart, line.day, now);
      if (!date) continue;
      const category = categoryFor(line.category);
      db.insert(schema.transactions)
        .values({
          id: randomUUID(),
          accountId: accountId(line.account),
          type: line.type,
          category: category.name,
          categoryId: category.id,
          amount: line.amount,
          description: line.description,
          payeeId: payeeIds.get(line.payee) ?? null,
          date,
          createdAt: date,
        })
        .run();
      transactions += 1;
      if (line.account === "card" && line.type === "debit") {
        cardCharges += line.amount;
      }
    }

    const savingsDate = onDay(monthStart, 10, now);
    if (savingsDate) {
      db.insert(schema.transfers)
        .values({
          id: randomUUID(),
          fromAccountId: accountId("checking"),
          toAccountId: accountId("savings"),
          amount: 1200,
          fromAmount: 1200,
          toAmount: 1200,
          category: transferCategory.name,
          categoryId: transferCategory.id,
          description: "Move to savings",
          date: savingsDate,
          createdAt: savingsDate,
        })
        .run();
      transfers += 1;
    }

    const investDate = onDay(monthStart, 16, now);
    if (investDate) {
      db.insert(schema.transfers)
        .values({
          id: randomUUID(),
          fromAccountId: accountId("checking"),
          toAccountId: accountId("brokerage"),
          amount: 500,
          fromAmount: 500,
          toAmount: 500,
          category: transferCategory.name,
          categoryId: transferCategory.id,
          description: "Index contribution",
          date: investDate,
          createdAt: investDate,
        })
        .run();
      transfers += 1;
      contributed += 500;
    }

    const paymentDate = onDay(monthStart, 25, now);
    if (paymentDate && cardCharges > 0) {
      const payment = Math.round(cardCharges * 100) / 100;
      db.insert(schema.transfers)
        .values({
          id: randomUUID(),
          fromAccountId: accountId("checking"),
          toAccountId: accountId("card"),
          amount: payment,
          fromAmount: payment,
          toAmount: payment,
          category: transferCategory.name,
          categoryId: transferCategory.id,
          description: "Card payment",
          date: paymentDate,
          createdAt: paymentDate,
        })
        .run();
      transfers += 1;
    }

    const valueDay = Math.min(
      28,
      index === monthStarts.length - 1
        ? now.getDate()
        : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
    );
    const valueDate = onDay(monthStart, valueDay, now);
    if (valueDate && contributed > 0) {
      db.insert(schema.investmentHistory)
        .values({
          id: randomUUID(),
          accountId: accountId("brokerage"),
          balance: contributed + gains[index],
          date: valueDate,
          createdAt: valueDate,
        })
        .run();
    }
  });

  const cashDate = onDay(monthStarts[0], 1, now) ?? now;
  db.insert(schema.balanceHistory)
    .values({
      id: randomUUID(),
      accountId: accountId("cash"),
      balance: 240,
      date: cashDate,
      createdAt: cashDate,
    })
    .run();

  let budgets = 0;
  for (const monthStart of monthStarts) {
    const yearMonth = format(monthStart, "yyyy-MM");
    for (const budget of BUDGETS) {
      const category = categoryFor(budget.category);
      db.insert(schema.budgets)
        .values({
          id: randomUUID(),
          categoryName: category.name,
          categoryId: category.id,
          yearMonth,
          amount: budget.amount,
          currency: CURRENCY,
          createdAt: monthStart,
          updatedAt: monthStart,
        })
        .run();
      budgets += 1;
    }
  }

  return {
    accounts: accountRows.length,
    transactions,
    transfers,
    budgets,
    currency: CURRENCY,
    email: DEV_PROFILE_EMAIL,
  };
};
