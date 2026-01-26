/**
 * Accounting utilities for calculating account balances
 * 
 * This module handles the different accounting rules for assets vs liabilities:
 * - Assets: Credits increase balance, debits decrease balance
 * - Liabilities: Credits decrease debt (reduce balance), debits increase debt (increase balance)
 * 
 * Liabilities are stored as negative values (e.g., -$3,000 debt)
 */

/**
 * Calculate balance for a transaction account based on its nature (asset vs liability)
 * 
 * @param initialBalance - The account's initial balance
 * @param credits - Sum of all credit transactions
 * @param debits - Sum of all debit transactions
 * @param transferIn - Sum of all incoming transfers
 * @param transferOut - Sum of all outgoing transfers
 * @param nature - Account nature: "asset" or "liability"
 * @returns The calculated balance
 * 
 * For assets: balance = initialBalance + credits - debits + transferIn - transferOut
 * For liabilities: balance = initialBalance - credits - debits + transferIn - transferOut
 * 
 * Note: Liabilities are stored as negative values. Credits reduce debt (make less negative),
 * debits increase debt (make more negative). Transfer IN pays down debt (makes less negative),
 * transfer OUT borrows more (makes more negative).
 * 
 * For liabilities:
 * - Transfer IN: money coming in pays down debt → ADD to balance (makes less negative) → +transferIn
 * - Transfer OUT: money going out borrows more → SUBTRACT from balance (makes more negative) → -transferOut
 */
export const calculateTransactionAccountBalance = (
  initialBalance: number,
  credits: number,
  debits: number,
  transferIn: number,
  transferOut: number,
  nature: "asset" | "liability"
): number => {
  if (nature === "asset") {
    // Assets: credits increase, debits decrease, transfers in increase, transfers out decrease
    return initialBalance + credits - debits + transferIn - transferOut;
  } else {
    // Liabilities: credits decrease debt (reduce balance/make less negative), debits increase debt (increase balance/make more negative)
    // Transfer IN decreases debt (paying down - makes less negative) → ADD to balance
    // Transfer OUT increases debt (borrowing more - makes more negative) → SUBTRACT from balance
    return initialBalance - credits - debits + transferIn - transferOut;
  }
};

/**
 * Calculate net contributions from transfers for an account
 * 
 * @param transferIn - Sum of all incoming transfers
 * @param transferOut - Sum of all outgoing transfers
 * @param nature - Account nature: "asset" or "liability"
 * @returns Net contributions (positive for assets receiving money, negative for liabilities receiving money)
 * 
 * For assets: netContributions = transferIn - transferOut
 * For liabilities: netContributions = transferOut - transferIn (inverted)
 */
export const calculateNetContributions = (
  transferIn: number,
  transferOut: number,
  nature: "asset" | "liability"
): number => {
  if (nature === "asset") {
    return transferIn - transferOut;
  } else {
    // For liabilities, receiving money (transferIn) reduces debt, so netContributions is negative
    // Sending money (transferOut) increases debt, so netContributions is positive
    return transferOut - transferIn;
  }
};
