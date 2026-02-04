import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEncryptionKey } from "@/lib/api-utils";
import { 
  mapFinverseTransactionToInternal, 
  shouldImportTransaction 
} from "@/lib/finverse-mapping";
import type { FinverseTransaction } from "@/lib/finverse-types";

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const encryptionKey = getEncryptionKey(request);
  if (!encryptionKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { 
      accountId,
      transactions,
      loginIdentityId,
    } = body;

    if (!accountId || !transactions || !Array.isArray(transactions) || !loginIdentityId) {
      return NextResponse.json({ 
        error: "Missing required parameters", 
        code: "MISSING_PARAMETERS",
        details: "accountId, transactions array, and loginIdentityId are required"
      }, { status: 400 });
    }

    const db = getDb(encryptionKey);

    // Verify account exists and get account nature
    const account = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (account.type !== "transaction") {
      return NextResponse.json(
        { error: "Transactions can only be imported to transaction accounts" },
        { status: 400 }
      );
    }

    // Get existing Finverse transaction IDs for deduplication
    const existingTransactions = db.select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId))
      .all();

    const existingFinverseIds: string[] = [];
    for (const tx of existingTransactions) {
      if (tx.metadata) {
        try {
          const metadata = JSON.parse(tx.metadata);
          if (metadata?.finverse?.transaction_id) {
            existingFinverseIds.push(metadata.finverse.transaction_id);
          }
        } catch (e) {
          // Skip invalid metadata
        }
      }
    }

    console.log(`Found ${existingFinverseIds.length} existing Finverse transaction IDs for deduplication`);

    // Filter out duplicates and map transactions
    const syncBatch = `sync_${Date.now()}`;
    const finverseAccountId = account.metadata 
      ? (JSON.parse(account.metadata)?.finverse?.account_id || "")
      : "";

    const newTransactions = (transactions as FinverseTransaction[])
      .filter(tx => {
        // Skip pending transactions
        if (tx.is_pending) {
          return false;
        }
        return shouldImportTransaction(tx, existingFinverseIds);
      })
      .map(tx => {
        const mapped = mapFinverseTransactionToInternal(
          tx,
          accountId,
          finverseAccountId,
          account.nature,
          loginIdentityId,
          syncBatch
        );
        return {
          id: uuidv4(),
          ...mapped,
          createdAt: new Date(),
        };
      });

    console.log(`Processing ${newTransactions.length} new transactions (${transactions.length - newTransactions.length} duplicates filtered)`);

    if (newTransactions.length === 0) {
      return NextResponse.json({
        imported_count: 0,
        skipped_count: transactions.length,
        sync_batch: syncBatch
      });
    }

    // Import new transactions
    let importedCount = 0;
    for (const tx of newTransactions) {
      try {
        db.insert(schema.transactions).values({
          id: tx.id,
          accountId: tx.accountId,
          type: tx.type,
          category: tx.category,
          amount: tx.amount,
          description: tx.description,
          date: tx.date,
          metadata: tx.metadata,
          createdAt: tx.createdAt,
        }).run();
        importedCount++;
      } catch (error) {
        console.error(`Error importing transaction ${tx.id}:`, error);
        // Continue with other transactions
      }
    }

    // Update account sync status
    const accountMetadata = account.metadata ? JSON.parse(account.metadata) : {};
    const finverseMetadata = accountMetadata.finverse || {};
    
    finverseMetadata.sync_status = "completed";
    finverseMetadata.last_synced = new Date().toISOString();
    finverseMetadata.sync_progress = {
      ...finverseMetadata.sync_progress,
      processed_transactions: (finverseMetadata.sync_progress?.processed_transactions || 0) + importedCount,
      last_updated: new Date().toISOString()
    };

    accountMetadata.finverse = finverseMetadata;

    db.update(schema.accounts)
      .set({
        metadata: JSON.stringify(accountMetadata),
        updatedAt: new Date()
      })
      .where(eq(schema.accounts.id, accountId))
      .run();

    console.log(`✅ Imported ${importedCount} transactions for account ${accountId}`);

    return NextResponse.json({
      imported_count: importedCount,
      skipped_count: transactions.length - importedCount,
      sync_batch: syncBatch
    });

  } catch (error) {
    console.error("Error in importTransactions:", error);
    return NextResponse.json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
};
