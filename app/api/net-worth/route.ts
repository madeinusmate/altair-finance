import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/currencies";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { calculateTransactionAccountBalance } from "@/lib/accounting";

interface AccountBalance {
  id: string;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
  currency: string;
  balance: number;
  // Investment-specific fields
  netContributions?: number;
  profitLoss?: number;
  updatedAt: Date;
}

interface CurrencyNetWorth {
  currency: SupportedCurrency;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  totalProfitLoss: number;
}

const roundWithPrecision = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const roundForNetWorth = (value: number): number => {
  const abs = Math.abs(value);
  const decimals = abs >= 1_000_000 ? 0 : 2;
  return roundWithPrecision(value, decimals);
};

// GET net worth calculation
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb(key);

    // Get all accounts
    const accounts = db.select().from(schema.accounts).all();
    
    // Debug: log account types
    console.log(`[net-worth] Processing ${accounts.length} accounts:`, accounts.map(a => ({ id: a.id, name: a.name, type: a.type })));

    // Calculate balance for each account
    const accountBalances: AccountBalance[] = await Promise.all(
      accounts.map(async (account) => {
        let balance: number;
        let netContributions: number | undefined;
        let profitLoss: number | undefined;

        if (account.type === "balance") {
          // For balance accounts, get the latest balance from history
          const latestBalance = db
            .select()
            .from(schema.balanceHistory)
            .where(eq(schema.balanceHistory.accountId, account.id))
            .orderBy(desc(schema.balanceHistory.date))
            .limit(1)
            .get();

          balance = latestBalance?.balance ?? account.initialBalance;
        } else if (account.type === "investment") {
          // For investment accounts: balance from investment_history, profit/loss from transfers
          const latestBalance = db
            .select()
            .from(schema.investmentHistory)
            .where(eq(schema.investmentHistory.accountId, account.id))
            .orderBy(desc(schema.investmentHistory.date))
            .limit(1)
            .get();

          balance = latestBalance?.balance ?? 0;

          // Calculate net contributions from transfers
          const transfersFrom = db
            .select()
            .from(schema.transfers)
            .where(eq(schema.transfers.fromAccountId, account.id))
            .all();

          const transfersTo = db
            .select()
            .from(schema.transfers)
            .where(eq(schema.transfers.toAccountId, account.id))
            .all();

          // Use fromAmount for outgoing transfers, toAmount for incoming transfers
          const transferOut = transfersFrom.reduce((sum, t) => sum + (t.fromAmount ?? t.amount), 0);
          const transferIn = transfersTo.reduce((sum, t) => sum + (t.toAmount ?? t.amount), 0);

          netContributions = transferIn - transferOut;
          // Ensure profitLoss is always a number, even if 0
          profitLoss = balance - netContributions;
        } else {
          // For transaction accounts: calculate balance based on account nature (asset vs liability)
          // Assets: credits increase, debits decrease, transfers in increase, transfers out decrease
          // Liabilities: debits increase liability, credits decrease liability, transfers out increase liability, transfers in decrease liability
          const transactions = db
            .select()
            .from(schema.transactions)
            .where(eq(schema.transactions.accountId, account.id))
            .all();

          const credits = transactions
            .filter((t) => t.type === "credit")
            .reduce((sum, t) => sum + t.amount, 0);

          const debits = transactions
            .filter((t) => t.type === "debit")
            .reduce((sum, t) => sum + t.amount, 0);

          // Also account for transfers
          const transfersFrom = db
            .select()
            .from(schema.transfers)
            .where(eq(schema.transfers.fromAccountId, account.id))
            .all();

          const transfersTo = db
            .select()
            .from(schema.transfers)
            .where(eq(schema.transfers.toAccountId, account.id))
            .all();

          // Use fromAmount for outgoing transfers, toAmount for incoming transfers
          const transferOut = transfersFrom.reduce((sum, t) => sum + (t.fromAmount ?? t.amount), 0);
          const transferIn = transfersTo.reduce((sum, t) => sum + (t.toAmount ?? t.amount), 0);

          balance = calculateTransactionAccountBalance(
            account.initialBalance,
            credits,
            debits,
            transferIn,
            transferOut,
            account.nature as "asset" | "liability"
          );
        }

        const accountBalance: AccountBalance = {
          id: account.id,
          name: account.name,
          type: account.type as "balance" | "transaction" | "investment",
          nature: account.nature as "asset" | "liability",
          category: account.category,
          currency: account.currency,
          balance,
          updatedAt: account.updatedAt,
        };

        // Add investment-specific fields only for investment accounts
        if (account.type === "investment") {
          accountBalance.netContributions = netContributions;
          accountBalance.profitLoss = profitLoss;
        }

        return accountBalance;
      })
    );

    const unsupportedCurrencies = Array.from(
      new Set(
        accountBalances
          .map((account) => account.currency)
          .filter((currency) => !isSupportedCurrency(currency))
      )
    );

    const fxSnapshot = await getFxSnapshot(db);

    const netWorthByCurrency = SUPPORTED_CURRENCIES.reduce<Record<SupportedCurrency, CurrencyNetWorth>>(
      (acc, targetCurrency) => {
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalProfitLoss = 0;

        for (const account of accountBalances) {
          if (!isSupportedCurrency(account.currency)) {
            continue;
          }

          const convertedBalance = roundForNetWorth(
            convertAmount(account.balance, account.currency, targetCurrency, fxSnapshot.rates)
          );

          if (account.nature === "asset") {
            totalAssets += convertedBalance;
          } else {
            // Liabilities are stored as positive values
            // If balance is positive, it's a debt (subtract from net worth)
            // If balance is negative, it's a credit/overpayment (add to net worth)
            if (convertedBalance >= 0) {
              totalLiabilities += convertedBalance;
            } else {
              // Negative liability (credit balance) adds to net worth
              totalAssets += Math.abs(convertedBalance);
            }
          }

          if (account.type === "investment" && account.profitLoss !== undefined) {
            const convertedProfitLoss = roundForNetWorth(
              convertAmount(account.profitLoss, account.currency, targetCurrency, fxSnapshot.rates)
            );
            totalProfitLoss += convertedProfitLoss;
          }
        }

        acc[targetCurrency] = {
          currency: targetCurrency,
          totalAssets,
          totalLiabilities,
          netWorth: totalAssets - totalLiabilities,
          totalProfitLoss,
        };

        return acc;
      },
      {} as Record<SupportedCurrency, CurrencyNetWorth>
    );

    return NextResponse.json({
      netWorthByCurrency,
      accounts: accountBalances,
      totalAccounts: accounts.length,
      lastRatesUpdatedAt: fxSnapshot.effectiveDate,
      isRatesStale: fxSnapshot.isStale,
      usedFallbackRates: fxSnapshot.usedFallback,
      hasUnsupportedCurrencies: unsupportedCurrencies.length > 0,
      unsupportedCurrencies,
    });
  } catch (error) {
    console.error("Error calculating net worth:", error);
    return NextResponse.json({ error: "Failed to calculate net worth" }, { status: 500 });
  }
};
