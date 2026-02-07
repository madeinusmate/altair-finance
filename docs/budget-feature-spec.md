# Budget Feature Specification

## Overview

This document specifies the implementation of a budgeting feature for Netly, a personal finance tracking application. The feature enables users to set monthly budgets for transaction categories, with automatic rollup to an overall monthly budget.

## Requirements Summary

### Core Functionality
- **Budget Scope**: Category-based budgets that roll up to an overall monthly budget
- **Budget Period**: Monthly budgets (applies to every month until changed)
- **Currency Handling**: Budgets convert automatically based on dashboard currency selection
- **Budget Persistence**: Template-based (single budget template applies to all months)

### User Interface
- **Budget Management Page**: Dedicated page at `/budget` for managing budgets
- **Dashboard Tile**: New tile on dashboard showing overall budget status, remaining amount, and percentage used
- **Navigation**: Budget link added to sidebar navigation

### Budget Tracking
- **Spending Calculation**: All debit transactions, excluding transfers and investment transactions
- **Visualization**: Progress bars, doughnut chart, gauge, bar chart, line chart
- **Color Coding**: Green (0-75%), Yellow (75-100%), Red (>100%)
- **Empty Budgets**: Display as "Unlimited"

### Budget Management
- **Actions**: Create, edit, delete budgets via modal dialogs
- **Category Selection**: Budgets for all transaction categories (auto-create empty budgets)
- **History**: View historical budgets and compare across months (read-only for past months)
- **Overall Budget**: Automatically calculated as sum of category budgets

## Database Schema

### New Table: `budgets`

```sql
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budgets_category_name ON budgets(category_name);
```

**Schema Notes:**
- `category_name` stores the transaction category name as text (not a foreign key) to handle category deletion gracefully
- `amount` is stored in a base currency (user's primary currency)
- `currency` stores the base currency code
- Budgets are template-based - one budget per category that applies to all months

## API Endpoints

### 1. GET `/api/budgets`

Retrieve all budgets with current month spending data.

**Query Parameters:**
- `currency` (optional): Target currency for conversion (defaults to base currency)

**Response:**
```typescript
{
  budgets: Array<{
    id: string;
    categoryName: string;
    amount: number; // Budget amount in requested currency
    currency: string; // Requested currency
    spent: number; // Current month spending in requested currency
    remaining: number; // Budget remaining
    percentageUsed: number; // Percentage of budget used (0-100+)
    isOverBudget: boolean; // True if spent > amount
  }>;
  overallBudget: number; // Sum of all category budgets
  overallSpent: number; // Total spending across all categories
  overallRemaining: number; // Overall budget remaining
  overallPercentageUsed: number; // Overall percentage used
  currency: string; // Response currency
  month: string; // Current month in YYYY-MM format
}
```

**Implementation Notes:**
- Calculate spending for current month (start of month to end of current day)
- Filter transactions: `type = 'debit'`, exclude transfers, exclude investment accounts
- Convert amounts using exchange rates from `exchange_rates` table
- Calculate percentage used: `(spent / amount) * 100`
- Handle categories with no budget (show as unlimited)

### 2. POST `/api/budgets`

Create or update a budget for a category.

**Request Body:**
```typescript
{
  categoryName: string; // Must match existing transaction category
  amount: number; // Budget amount
  currency: string; // Base currency for the budget
}
```

**Response:**
```typescript
{
  id: string;
  categoryName: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}
```

**Validation:**
- Category must exist in `transaction_categories` table
- Amount must be >= 0
- Currency must be valid

**Behavior:**
- If budget exists for category, update it
- If budget doesn't exist, create new one
- Update `updatedAt` timestamp

### 3. DELETE `/api/budgets/:id`

Delete a budget by ID.

**Response:**
```typescript
{
  success: boolean;
}
```

### 4. GET `/api/budgets/spending`

Calculate spending for budget categories within a date range (for historical views).

**Query Parameters:**
- `startDate`: Start date (ISO format: YYYY-MM-DD)
- `endDate`: End date (ISO format: YYYY-MM-DD)
- `currency`: Target currency for conversion

**Response:**
```typescript
{
  spending: Array<{
    categoryName: string;
    spent: number;
    currency: string;
  }>;
  totalSpent: number;
  currency: string;
  period: {
    startDate: string;
    endDate: string;
  };
}
```

### 5. GET `/api/dashboard/budget`

Get budget summary for dashboard tile (optimized, lightweight).

**Query Parameters:**
- `currency`: Target currency for conversion

**Response:**
```typescript
{
  overallBudget: number;
  overallSpent: number;
  overallRemaining: number;
  overallPercentageUsed: number;
  currency: string;
  status: "under" | "approaching" | "over"; // Based on percentage used
  month: string; // YYYY-MM format
}
```

## Budget Management Page

### Route: `/budget`

**Layout Structure:**
1. **Header Section**
   - Page title: "Budget"
   - Month selector (defaults to current month)
   - Quick actions: "Add Budget" button

2. **Overall Summary Card**
   - Overall monthly budget amount
   - Total spent this month
   - Amount remaining
   - Percentage used with gauge visualization
   - Color-coded status indicator

3. **Charts Section** (Grid layout, 2 columns)
   - Doughnut chart: Budget allocation by category
   - Gauge chart: Overall budget utilization
   - Bar chart: Budget vs actual spending per category
   - Line chart: Spending trend over time vs budget line

4. **Category Budgets List/Table**
   - Columns: Category, Budget, Spent, Remaining, % Used, Actions
   - Progress bars with color coding
   - Click row to edit budget
   - Empty state for categories without budgets (show as "Unlimited")

**Features:**
- Month selector allows viewing past months (read-only)
- Modal dialog for creating/editing budgets
- Delete confirmation dialog
- Real-time updates when budgets change
- Loading states and error handling

**Components:**
- `BudgetSummaryCard`: Overall budget summary
- `BudgetCategoryList`: Table/list of category budgets
- `BudgetEditDialog`: Modal for create/edit
- `BudgetCharts`: Container for all chart visualizations
- `MonthSelector`: Month navigation component

## Dashboard Tile

### Component: `BudgetTile`

**Display:**
- Title: "Budget"
- Overall monthly budget amount (large, prominent)
- Amount remaining (medium size)
- Percentage used (with visual indicator)
- Color-coded status (green/yellow/red border or background)
- Clickable to navigate to `/budget` page

**Position:**
- Add to dashboard grid alongside Net Worth, Assets, Liabilities, Investment P/L tiles
- Place in first row or second row depending on layout

**Data Source:**
- Fetch from `/api/dashboard/budget` endpoint
- Update when dashboard date range changes (if applicable)
- Show loading skeleton while fetching

## Spending Calculation Logic

### Rules

**Include:**
- All debit transactions (`type = 'debit'`)
- Transactions matching the category name
- Transactions within the specified date range

**Exclude:**
- Transfer transactions (`category = 'Transfer'`)
- Transactions from investment accounts (`account.type = 'investment'`)
- Credit transactions (`type = 'credit'`)

### SQL Query Pattern

```sql
SELECT 
  SUM(t.amount) as spent
FROM transactions t
INNER JOIN accounts a ON t.account_id = a.id
WHERE 
  t.type = 'debit'
  AND t.category = ?
  AND t.date >= ?
  AND t.date <= ?
  AND a.type != 'investment'
  AND t.category != 'Transfer'
```

### Currency Conversion

- Use exchange rates from `exchange_rates` table
- Convert spending amounts to target currency
- Use same conversion logic as existing dashboard features
- Handle missing exchange rates gracefully

## Visualizations

### 1. Doughnut Chart
- **Purpose**: Show budget allocation by category
- **Data**: Budget amounts per category
- **Visual**: Segments sized by budget amount, labeled with category names
- **Library**: Use existing chart library (likely Recharts based on other charts)

### 2. Gauge Chart
- **Purpose**: Overall budget utilization meter
- **Data**: Overall percentage used (0-100%)
- **Visual**: Circular gauge with color zones (green/yellow/red)
- **Display**: Percentage value in center

### 3. Bar Chart
- **Purpose**: Compare budget vs actual spending per category
- **Data**: Budget amount and spent amount per category
- **Visual**: Side-by-side bars for each category
- **Colors**: Budget bar (blue), Spent bar (green/yellow/red based on status)

### 4. Line Chart
- **Purpose**: Show spending trend over time vs budget line
- **Data**: Daily/weekly spending totals vs budget line
- **Visual**: Line for actual spending, horizontal line for budget
- **Time Range**: Current month with daily data points

## Color Coding System

### Status Colors

- **Green**: 0-75% used (under budget, healthy)
- **Yellow**: 75-100% used (approaching limit, warning)
- **Red**: >100% used (over budget, exceeded)

### Application

Apply colors to:
- Progress bars in category list
- Dashboard tile indicator
- Category list row backgrounds/borders
- Chart elements (bars, segments)
- Gauge chart zones
- Status badges

## Currency Handling

### Storage
- Budgets stored in base currency (user's primary currency or USD)
- `currency` field in budgets table stores base currency

### Display
- Convert budgets and spending to dashboard currency on-the-fly
- Use exchange rates from `exchange_rates` table
- Display currency selector on budget page (matches dashboard)
- Handle currency conversion errors gracefully

### Conversion Logic
- Fetch exchange rate for `baseCurrency -> targetCurrency` on `effective_date`
- Use most recent rate if exact date not available
- Fall back to 1:1 if no rate available (same currency or missing rate)

## Empty States

### No Budgets Set
- **Message**: "No budgets set yet"
- **Description**: Brief explanation of how budgets work
- **Action**: "Create Budget" button
- **Visual**: Empty state illustration or icon

### Category Without Budget
- **Display**: Show as "Unlimited" in category list
- **Visual**: No progress bar, different styling
- **Action**: "Set Budget" button/link
- **Behavior**: Clicking opens create budget dialog

## Historical Budget Viewing

### Month Selector
- Dropdown or date picker for selecting month
- Default to current month
- Allow selecting past months (read-only)
- Allow selecting future months (for planning, read-only)

### Past Month Display
- Show actual spending vs budget for selected month
- Disable edit/delete actions for past months
- Show "View Only" indicator
- Enable comparison across months

### Future Considerations
- Allow setting budgets for future months
- Show projected spending based on trends

## Navigation Updates

### Sidebar Navigation
Add new navigation item:
```typescript
{
  title: "Budget",
  url: "/budget",
  icon: DollarSign, // or Target, TrendingUp, PieChart
}
```

Position after "Transactions" and before "Settings".

## Performance Considerations

### Optimization Strategies
- Use `Promise.all()` for parallel API calls (following `async-parallel` rule)
- Cache budget data appropriately (React state, consider SWR)
- Optimize spending calculations with proper SQL queries
- Add database indexes: `idx_transactions_category_date_type` on `transactions(category, date, type)`
- Minimize data passed to client components
- Use React.memo for expensive chart components

### Database Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_transactions_category_date_type 
ON transactions(category, date, type);

CREATE INDEX IF NOT EXISTS idx_budgets_category_name 
ON budgets(category_name);
```

## Error Handling

### API Errors
- Handle missing categories gracefully
- Handle currency conversion errors
- Handle database errors with user-friendly messages
- Validate input data (amounts, categories, dates)

### UI Errors
- Show loading states during data fetch
- Display error messages for failed operations
- Provide retry mechanisms
- Handle empty states appropriately

## Testing Considerations

### Test Cases
1. **Currency Conversion**
   - Test with multiple currencies
   - Test with missing exchange rates
   - Test with same currency (no conversion)

2. **Spending Calculation**
   - Test with categories that have no transactions
   - Test with categories that exceed budget
   - Test exclusion of transfers and investments
   - Test date range filtering

3. **Budget Management**
   - Test create, edit, delete operations
   - Test category deletion (budgets should handle gracefully)
   - Test empty state (no budgets set)
   - Test month transitions

4. **Visualizations**
   - Test with various data scenarios (empty, single category, many categories)
   - Test color coding accuracy
   - Test chart responsiveness

5. **Edge Cases**
   - Zero budget amounts
   - Very large budget amounts
   - Categories with no transactions
   - Deleted categories with existing budgets

## Implementation Phases

### Phase 1: Database & API
1. Add budgets table to schema
2. Create migration
3. Implement API endpoints (GET, POST, DELETE)
4. Implement spending calculation logic

### Phase 2: Budget Management Page
1. Create page structure
2. Implement budget list/table
3. Implement create/edit/delete modals
4. Add month selector

### Phase 3: Visualizations
1. Implement charts (doughnut, gauge, bar, line)
2. Add color coding
3. Integrate charts into budget page

### Phase 4: Dashboard Integration
1. Create budget tile component
2. Add to dashboard page
3. Implement navigation link

### Phase 5: Polish & Testing
1. Add empty states
2. Improve error handling
3. Add loading states
4. Test all scenarios
5. Performance optimization

## Future Enhancements (Out of Scope)

- Budget templates/presets
- Budget suggestions based on past spending
- Budget alerts/notifications
- Recurring budgets with different amounts per month
- Budget goals and targets
- Budget sharing/collaboration
- Budget reports and analytics
- Mobile app support
