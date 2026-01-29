# CSV Import Tracking and Rollback Feature Specification

## Overview

This feature adds the ability to track CSV imports and rollback/delete entire import batches. Users will be able to view their import history and delete imports, which will remove all records (transactions, transfers, balances, investments) that were created during that specific import.

**Scope**: Transactions and balances imports only (account imports excluded as per requirements).

## Database Schema Changes

### New Table: `imports`

Create a new table to track import metadata:

```sql
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('transactions', 'balances')),
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_imports_type ON imports(type);
CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports(created_at);
CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON imports(file_hash);
```

### Schema Updates

Add `importId` foreign key column to existing tables:

- `transactions.import_id` → references `imports.id` (nullable, ON DELETE SET NULL)
- `transfers.import_id` → references `imports.id` (nullable, ON DELETE SET NULL)  
- `balance_history.import_id` → references `imports.id` (nullable, ON DELETE SET NULL)
- `investment_history.import_id` → references `imports.id` (nullable, ON DELETE SET NULL)

**Migration Strategy**: 
- Add columns as nullable (existing records will have NULL import_id)
- No backfill of existing data - only new imports will be tracked

## File Hash Calculation

Calculate file hash using metadata approach:
- Hash: `filename + row_count + first_row_data + last_row_data`
- Purpose: Detect duplicate imports (warn user, allow merge)
- Implementation: Use crypto.createHash('sha256') in Node.js

## API Endpoints

Following existing RESTful patterns in the codebase:

### GET `/api/imports`

List all imports with optional filtering.

**Query Parameters**:
- `type` (optional): Filter by 'transactions' or 'balances'

**Response**:
```typescript
{
  imports: Array<{
    id: string;
    type: 'transactions' | 'balances';
    filename: string;
    fileHash: string;
    rowCount: number;
    createdAt: Date;
  }>
}
```

### GET `/api/imports/:id`

Get details of a specific import.

**Response**:
```typescript
{
  id: string;
  type: 'transactions' | 'balances';
  filename: string;
  fileHash: string;
  rowCount: number;
  createdAt: Date;
  // Summary stats
  transactionsCount?: number;
  transfersCount?: number;
  balancesCount?: number;
  investmentsCount?: number;
}
```

### DELETE `/api/imports/:id`

Delete an import and all associated records.

**Behavior**:
- Delete all transactions/transfers with matching `importId`
- Delete all balance_history/investment_history with matching `importId`
- For transfers: Delete both sides together (fromAccountId and toAccountId records)
- Continue on partial failures (don't rollback transaction)
- Return summary of what was deleted

**Response**:
```typescript
{
  success: boolean;
  deleted: {
    transactions?: number;
    transfers?: number;
    balances?: number;
    investments?: number;
  }
}
```

## Import Flow Changes

### Modify Import Endpoints

**`/api/import/transactions`**:
1. Create import record before inserting transactions/transfers
2. Calculate file hash from request metadata
3. Check for duplicate file hash - warn if found but allow import
4. Store `importId` when inserting transactions and transfers
5. Return import ID in response

**`/api/import/balances`**:
1. Create import record before inserting balances/investments
2. Calculate file hash from request metadata  
3. Check for duplicate file hash - warn if found but allow import
4. Store `importId` when inserting balance_history and investment_history
5. Return import ID in response

**Request Changes**: Add optional `filename` and `fileHash` to request body for tracking.

## Frontend Implementation

### New Page: `/settings/imports`

Create a dedicated page for viewing and managing imports.

**Components**:
- `ImportHistoryList`: Table/list of imports with filtering
- `ImportItem`: Individual import row with delete button
- `DeleteImportDialog`: Two-step confirmation dialog

**Features**:
- Display: filename, date/time, type, row count
- Filter by import type (transactions/balances)
- Sort by date (newest first by default)
- Delete button for each import
- Two-step confirmation: summary view → explicit confirm

**UI Flow**:
1. User clicks delete on an import
2. Show dialog with import summary (type, filename, date, row counts)
3. User confirms deletion
4. Show success dialog with breakdown of deleted records
5. Show toast notification
6. Refresh import list

### Update Import Wizard

**`hooks/use-import-wizard.ts`**:
- Calculate file hash before calling import API
- Pass filename and fileHash to import endpoints
- Store import ID from response for future reference

**`app/(app)/settings/import/page.tsx`**:
- After successful import, optionally show link to import history
- No major changes to wizard flow

### Update Settings Page

**`app/(app)/settings/page.tsx`**:
- Add link to "Import History" page in the "Data import" card
- Link: `/settings/imports`

## Implementation Details

### File Hash Calculation

```typescript
// In use-import-wizard.ts or utility
const calculateFileHash = (
  filename: string, 
  rowCount: number, 
  firstRow: Record<string, string>, 
  lastRow: Record<string, string>
): string => {
  const data = `${filename}|${rowCount}|${JSON.stringify(firstRow)}|${JSON.stringify(lastRow)}`;
  // Use Web Crypto API in browser or crypto in Node.js
  return hash(data);
};
```

### Duplicate Detection

When importing:
1. Calculate file hash
2. Query imports table for matching file_hash
3. If found: Show warning in UI but allow import to proceed
4. Create new import record (don't merge)

### Delete Operation

```typescript
// Pseudo-code for DELETE /api/imports/:id
1. Verify import exists
2. Count records to be deleted (for summary)
3. Delete transactions WHERE import_id = :id
4. Delete transfers WHERE import_id = :id  
5. Delete balance_history WHERE import_id = :id
6. Delete investment_history WHERE import_id = :id
7. Delete import record
8. Return summary counts
```

**Error Handling**: Continue on partial failures, return what was successfully deleted.

### Transfer Handling

When deleting transfers:
- Query transfers by `importId`
- Delete both the transfer record and ensure no orphaned records
- Since transfers are single records (not split), delete the transfer record directly

## Edge Cases

1. **Partial Import Failures**: Only track successfully imported rows (as per requirements)
2. **Duplicate Imports**: Warn user but allow, create separate import record
3. **Modified Records**: Delete anyway (no validation checks per requirements)
4. **Large Imports**: No performance concerns per requirements, but use efficient batch deletes
5. **Concurrent Deletes**: SQLite handles this, but ensure proper error handling

## Files to Modify

### Database
- `lib/db/schema.ts`: Add imports table and importId columns
- `lib/db/index.ts`: Add migration SQL for new table and columns

### API Routes
- `app/api/imports/route.ts`: NEW - GET list, GET by id, DELETE
- `app/api/import/transactions/route.ts`: Add import tracking
- `app/api/import/balances/route.ts`: Add import tracking

### Frontend
- `app/(app)/settings/imports/page.tsx`: NEW - Import history page
- `components/imports/import-history-list.tsx`: NEW - List component
- `components/imports/delete-import-dialog.tsx`: NEW - Delete dialog
- `hooks/use-import-wizard.ts`: Add file hash calculation
- `app/(app)/settings/page.tsx`: Add link to import history
- `lib/api-client.ts`: No changes needed (uses existing patterns)

## Testing Considerations

1. Test import tracking for transactions and balances
2. Test duplicate file hash detection and warning
3. Test delete operation removes all associated records
4. Test transfer deletion removes both sides
5. Test filtering and sorting in import history
6. Test two-step confirmation dialog
7. Test error handling for partial delete failures

## Future Enhancements (Out of Scope)

- Bulk delete multiple imports
- Import restore/undo functionality
- Detailed import preview with record list
- Export import metadata
- Import statistics/analytics
