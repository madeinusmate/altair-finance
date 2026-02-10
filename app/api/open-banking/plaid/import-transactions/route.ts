import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  mapPlaidTransactionToInternal,
  shouldImportTransaction,
} from "@/lib/plaid-mapping";
import type { PlaidTransaction } from "@/lib/plaid-types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { accountId, transactions, itemId } = body;

    if (
      !accountId ||
      !transactions ||
      !Array.isArray(transactions) ||
      !itemId
    ) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          code: "MISSING_PARAMETERS",
          details:
            "accountId, transactions array, and itemId are required",
        },
        { status: 400 }
      );
    }

    const db = getDb(encryptionKey);

    // Verify account exists and get account nature
    const account = db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (account.type !== "transaction") {
      return NextResponse.json(
        {
          error:
            "Transactions can only be imported to transaction accounts",
        },
        { status: 400 }
      );
    }

    // Get existing Plaid transaction IDs for deduplication
    const existingTransactions = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId))
      .all();

    const existingPlaidIds: string[] = [];
    for (const tx of existingTransactions) {
      if (tx.metadata) {
        try {
          const metadata = JSON.parse(tx.metadata);
          if (metadata?.plaid?.transaction_id) {
            existingPlaidIds.push(metadata.plaid.transaction_id);
          }
        } catch {
          // Skip invalid metadata
        }
      }
    }

    console.log(
      `Found ${existingPlaidIds.length} existing Plaid transaction IDs for deduplication`
    );

    // Filter out duplicates and pending, then map transactions
    const syncBatch = `sync_${Date.now()}`;
    const plaidAccountId = account.metadata
      ? JSON.parse(account.metadata)?.plaid?.account_id || ""
      : "";

    const newTransactions = (transactions as PlaidTransaction[])
      .filter((tx) => {
        if (tx.pending) return false;
        return shouldImportTransaction(tx, existingPlaidIds);
      })
      .map((tx) => {
        const mapped = mapPlaidTransactionToInternal(
          tx,
          accountId,
          plaidAccountId,
          account.nature,
          itemId,
          syncBatch
        );
        return {
          id: uuidv4(),
          ...mapped,
          createdAt: new Date(),
        };
      });

    console.log(
      `Processing ${newTransactions.length} new Plaid transactions (${transactions.length - newTransactions.length} duplicates/pending filtered)`
    );

    if (newTransactions.length === 0) {
      return NextResponse.json({
        imported_count: 0,
        skipped_count: transactions.length,
        sync_batch: syncBatch,
      });
    }

    // Import new transactions
    let importedCount = 0;
    for (const tx of newTransactions) {
      try {
        db.insert(schema.transactions)
          .values({
            id: tx.id,
            accountId: tx.accountId,
            type: tx.type,
            category: tx.category,
            amount: tx.amount,
            description: tx.description,
            date: tx.date,
            metadata: tx.metadata,
            createdAt: tx.createdAt,
          })
          .run();
        importedCount++;
      } catch (error) {
        console.error(`Error importing Plaid transaction ${tx.id}:`, error);
      }
    }

    // Update account sync status
    const accountMetadata = account.metadata
      ? JSON.parse(account.metadata)
      : {};
    const plaidMeta = accountMetadata.plaid || {};

    plaidMeta.sync_status = "completed";
    plaidMeta.last_synced = new Date().toISOString();
    plaidMeta.sync_progress = {
      ...plaidMeta.sync_progress,
      processed_transactions:
        (plaidMeta.sync_progress?.processed_transactions || 0) +
        importedCount,
      last_updated: new Date().toISOString(),
    };

    accountMetadata.plaid = plaidMeta;

    db.update(schema.accounts)
      .set({
        metadata: JSON.stringify(accountMetadata),
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId))
      .run();

    console.log(
      `Imported ${importedCount} Plaid transactions for account ${accountId}`
    );

    return NextResponse.json({
      imported_count: importedCount,
      skipped_count: transactions.length - importedCount,
      sync_batch: syncBatch,
    });
  } catch (error) {
    console.error("Error in Plaid importTransactions:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
