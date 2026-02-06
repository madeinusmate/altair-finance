import { NextRequest, NextResponse } from "next/server";
import { gte, lte, and, eq, desc, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { convertAmount, getFxSnapshot } from "@/lib/fx";
import { type SupportedCurrency } from "@/lib/currencies";

interface InvestmentDataPoint {
  date: string;
  dateLabel: string;
  value: number;
  netContributions: number;
  pnl: number;
  pnlPercentage: number;
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const key = getEncryptionKey(request);
  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const currency = (searchParams.get("currency") || "USD") as SupportedCurrency;
    const accountId = searchParams.get("accountId");

    if (!startDateParam || !endDateParam) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const db = getDb(key);
    const fxSnapshot = await getFxSnapshot(db);

    // Get investment accounts
    const investmentAccounts = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.type, "investment"))
      .all();

    if (investmentAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        currentValue: 0,
        previousValue: 0,
        percentageChange: 0,
        currency,
      });
    }

    // Filter by accountId if provided
    const accountsToQuery = accountId
      ? investmentAccounts.filter((acc) => acc.id === accountId)
      : investmentAccounts;

    if (accountsToQuery.length === 0) {
      return NextResponse.json({
        data: [],
        currentValue: 0,
        previousValue: 0,
        percentageChange: 0,
        currency,
      });
    }

    const accountIds = accountsToQuery.map((acc) => acc.id);
    const accountCurrencyMap = new Map(accountsToQuery.map((acc) => [acc.id, acc.currency]));

    // Get all transfers for these investment accounts (for net contributions calculation)
    const allTransfers = db
      .select()
      .from(schema.transfers)
      .where(
        or(
          accountIds.length === 1
            ? eq(schema.transfers.fromAccountId, accountIds[0])
            : inArray(schema.transfers.fromAccountId, accountIds),
          accountIds.length === 1
            ? eq(schema.transfers.toAccountId, accountIds[0])
            : inArray(schema.transfers.toAccountId, accountIds)
        )
      )
      .all();

    // Get the latest balance before start date for each account (initial balance)
    const initialBalances = new Map<string, number>();
    const initialNetContributions = new Map<string, number>();
    
    for (const accountId of accountIds) {
      const latestBeforeStart = db
        .select()
        .from(schema.investmentHistory)
        .where(
          and(
            eq(schema.investmentHistory.accountId, accountId),
            lte(schema.investmentHistory.date, startDate)
          )
        )
        .orderBy(desc(schema.investmentHistory.date))
        .limit(1)
        .get();

      if (latestBeforeStart) {
        const accountCurrency = accountCurrencyMap.get(accountId) || "USD";
        const convertedAmount = convertAmount(
          latestBeforeStart.balance,
          accountCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        initialBalances.set(accountId, convertedAmount);
      } else {
        initialBalances.set(accountId, 0);
      }

      // Calculate initial net contributions (transfers before start date)
      const transfersBeforeStart = allTransfers.filter(
        (t) =>
          (t.fromAccountId === accountId || t.toAccountId === accountId) &&
          new Date(t.date) <= startDate
      );

      const transferIn = transfersBeforeStart
        .filter((t) => t.toAccountId === accountId)
        .reduce((sum, t) => {
          const accountCurrency = accountCurrencyMap.get(accountId) || "USD";
          const toCurrency = accountCurrencyMap.get(t.fromAccountId) || accountCurrency;
          const convertedAmount = convertAmount(
            t.toAmount ?? t.amount,
            toCurrency as SupportedCurrency,
            currency,
            fxSnapshot.rates
          );
          return sum + convertedAmount;
        }, 0);

      const transferOut = transfersBeforeStart
        .filter((t) => t.fromAccountId === accountId)
        .reduce((sum, t) => {
          const accountCurrency = accountCurrencyMap.get(accountId) || "USD";
          const convertedAmount = convertAmount(
            t.fromAmount ?? t.amount,
            accountCurrency as SupportedCurrency,
            currency,
            fxSnapshot.rates
          );
          return sum + convertedAmount;
        }, 0);

      initialNetContributions.set(accountId, transferIn - transferOut);
    }

    // Get investment history for selected accounts in date range
    const historyEntries = db
      .select()
      .from(schema.investmentHistory)
      .where(
        and(
          accountIds.length === 1
            ? eq(schema.investmentHistory.accountId, accountIds[0])
            : inArray(schema.investmentHistory.accountId, accountIds),
          gte(schema.investmentHistory.date, startDate),
          lte(schema.investmentHistory.date, endDate)
        )
      )
      .orderBy(desc(schema.investmentHistory.date))
      .all();

    // Group entries by account and date, then forward-fill balances
    const accountBalancesByDate = new Map<string, Map<string, number>>();
    
    // Initialize maps for each account
    accountIds.forEach((accountId) => {
      accountBalancesByDate.set(accountId, new Map());
    });

    // Process history entries - group by account and date
    historyEntries.forEach((entry) => {
      const accountCurrency = accountCurrencyMap.get(entry.accountId) || "USD";
      const convertedAmount = convertAmount(
        entry.balance,
        accountCurrency as SupportedCurrency,
        currency,
        fxSnapshot.rates
      );

      const dateKey = new Date(entry.date).toISOString().split("T")[0];
      const accountMap = accountBalancesByDate.get(entry.accountId);
      if (accountMap) {
        // Use the latest entry for each date (in case of duplicates)
        const existing = accountMap.get(dateKey);
        if (!existing || new Date(entry.date).getTime() > new Date(existing).getTime()) {
          accountMap.set(dateKey, convertedAmount);
        }
      }
    });

    // Create a map to track net contributions changes by date (from transfers)
    // This will track the DELTA (change) for each date, not cumulative
    const netContributionsChangesByDate = new Map<string, Map<string, number>>();
    accountIds.forEach((accountId) => {
      netContributionsChangesByDate.set(accountId, new Map());
    });

    // Process ALL transfers up to endDate to track changes by date
    // We need all transfers to calculate cumulative contributions correctly
    allTransfers.forEach((transfer) => {
      const transferDate = new Date(transfer.date);
      const dateKey = transferDate.toISOString().split("T")[0];
      
      // Only process transfers up to endDate (for cumulative calculation)
      if (transferDate > endDate) return;

      // Handle incoming transfers (increase net contributions)
      if (accountIds.includes(transfer.toAccountId)) {
        const accountId = transfer.toAccountId;
        const accountCurrency = accountCurrencyMap.get(accountId) || "USD";
        const fromCurrency = accountCurrencyMap.get(transfer.fromAccountId) || accountCurrency;
        const convertedAmount = convertAmount(
          transfer.toAmount ?? transfer.amount,
          fromCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        
        const accountMap = netContributionsChangesByDate.get(accountId);
        if (accountMap) {
          // Accumulate changes for the same date (multiple transfers on same day)
          const current = accountMap.get(dateKey) || 0;
          accountMap.set(dateKey, current + convertedAmount);
        }
      }

      // Handle outgoing transfers (decrease net contributions)
      if (accountIds.includes(transfer.fromAccountId)) {
        const accountId = transfer.fromAccountId;
        const accountCurrency = accountCurrencyMap.get(accountId) || "USD";
        const convertedAmount = convertAmount(
          transfer.fromAmount ?? transfer.amount,
          accountCurrency as SupportedCurrency,
          currency,
          fxSnapshot.rates
        );
        
        const accountMap = netContributionsChangesByDate.get(accountId);
        if (accountMap) {
          // Accumulate changes for the same date (multiple transfers on same day)
          const current = accountMap.get(dateKey) || 0;
          accountMap.set(dateKey, current - convertedAmount);
        }
      }
    });

    // Collect all unique dates (from both balances and transfers)
    // Use a Set to ensure uniqueness
    const allDates = new Set<string>();
    
    // Add dates from balance history (these are already filtered to date range)
    accountBalancesByDate.forEach((accountMap) => {
      accountMap.forEach((_, date) => {
        allDates.add(date);
      });
    });
    
    // Add dates from transfers (net contributions changes) - only within date range
    netContributionsChangesByDate.forEach((accountMap) => {
      accountMap.forEach((_, date) => {
        // Add dates within the requested range
        const dateObj = new Date(date);
        if (dateObj >= startDate && dateObj <= endDate) {
          allDates.add(date);
        }
      });
    });
    
    // Ensure we have at least startDate and endDate if no data exists
    const startDateKey = startDate.toISOString().split("T")[0];
    const endDateKey = endDate.toISOString().split("T")[0];
    allDates.add(startDateKey);
    allDates.add(endDateKey);

    // Forward-fill balances and calculate net contributions, PnL for each date
    const dateMap = new Map<string, { value: number; netContributions: number; pnl: number; pnlPercentage: number }>();

    // Track the last known balance and net contributions for each account
    const lastKnownBalance = new Map<string, number>();
    const lastKnownNetContributions = new Map<string, number>();
    
    accountIds.forEach((accountId) => {
      lastKnownBalance.set(accountId, initialBalances.get(accountId) || 0);
      lastKnownNetContributions.set(accountId, initialNetContributions.get(accountId) || 0);
    });

    // Sort dates chronologically (only once, after collecting all dates)
    const allSortedDates = Array.from(allDates).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    // For each date, calculate totals using forward-filled values
    // Process dates chronologically to accumulate net contributions correctly
    allSortedDates.forEach((date) => {
      const dateObj = new Date(date);
      
      // Skip dates outside the requested range (safety check)
      if (dateObj < startDate || dateObj > endDate) {
        return;
      }
      
      let totalBalance = 0;
      let totalNetContributions = 0;
      
      accountIds.forEach((accountId) => {
        const accountMap = accountBalancesByDate.get(accountId);
        if (!accountMap) return;

        // Check if there's a balance entry for this exact date
        const balanceForDate = accountMap.get(date);
        
        if (balanceForDate !== undefined) {
          // Update last known balance
          lastKnownBalance.set(accountId, balanceForDate);
          totalBalance += balanceForDate;
        } else {
          // Forward-fill: use the last known balance
          totalBalance += lastKnownBalance.get(accountId) || 0;
        }

        // Get current cumulative net contributions (forward-filled from previous date)
        // This starts with initialNetContributions and accumulates as we process dates
        let accountNetContributions = lastKnownNetContributions.get(accountId) || 0;
        
        // Check if there's a net contributions change for this exact date
        const contributionsChangeMap = netContributionsChangesByDate.get(accountId);
        if (contributionsChangeMap) {
          const contributionsChange = contributionsChangeMap.get(date);
          if (contributionsChange !== undefined) {
            // Add the change to the cumulative value
            accountNetContributions = accountNetContributions + contributionsChange;
            // Update last known net contributions for forward-filling to next date
            lastKnownNetContributions.set(accountId, accountNetContributions);
          }
          // If no change on this date, accountNetContributions stays the same (forward-filled)
        }
        // If no contributionsChangeMap exists, accountNetContributions stays the same (forward-filled)
        
        // Add this account's cumulative net contributions to the total
        totalNetContributions += accountNetContributions;
      });

      // Calculate PnL
      const pnl = totalBalance - totalNetContributions;
      const pnlPercentage = totalNetContributions !== 0 ? (pnl / totalNetContributions) * 100 : 0;

      dateMap.set(date, {
        value: totalBalance,
        netContributions: totalNetContributions,
        pnl,
        pnlPercentage,
      });
    });

    // Convert to array - dates are already sorted chronologically from allSortedDates
    // Only include dates that have actual data (either balance or net contributions change)
    const data: InvestmentDataPoint[] = allSortedDates
      .map((date) => {
        const dataPoint = dateMap.get(date);
        if (!dataPoint) {
          return null;
        }
        return {
          date,
          dateLabel: new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          value: dataPoint.value,
          netContributions: dataPoint.netContributions,
          pnl: dataPoint.pnl,
          pnlPercentage: dataPoint.pnlPercentage,
        };
      })
      .filter((item): item is InvestmentDataPoint => item !== null)
      // Ensure no duplicate dates (shouldn't happen, but safety check)
      .filter((item, index, arr) => {
        return index === 0 || item.date !== arr[index - 1].date;
      });

    // Calculate current and previous values for percentage change
    const currentValue = data.length > 0 ? data[data.length - 1].value : 0;
    const previousValue = data.length > 1 ? data[data.length - 2].value : data[0]?.value || 0;
    const percentageChange =
      previousValue !== 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

    return NextResponse.json({
      data,
      currentValue,
      previousValue,
      percentageChange,
      currency,
    });
  } catch (error) {
    console.error("Error calculating investment performance:", error);
    return NextResponse.json({ error: "Failed to calculate investment performance" }, { status: 500 });
  }
};
