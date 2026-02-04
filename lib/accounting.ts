/**
 * Accounting utilities for calculating account balances
 * 
 * This module handles the different accounting rules for assets vs liabilities:
 * - Assets: Credits increase balance, debits decrease balance
 * - Liabilities: Debits increase liability (e.g., charge on credit card), credits decrease liability (e.g., payment)
 * 
 * Liabilities are stored as positive values (e.g., $3,000 debt)
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
 * For liabilities: balance = initialBalance + debits - credits + transferOut - transferIn
 * 
 * Note: Liabilities are stored as positive values.
 * - Debits increase liability (charge/purchase) → add debits
 * - Credits decrease liability (payment) → subtract credits
 * - Transfer OUT increases liability (borrowing more) → add transferOut
 * - Transfer IN decreases liability (paying down) → subtract transferIn
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
    // Liabilities: debits increase liability (charge/purchase) → add debits
    // Credits decrease liability (payment) → subtract credits
    // Transfer OUT increases liability (borrowing more) → add transferOut
    // Transfer IN decreases liability (paying down) → subtract transferIn
    return initialBalance + debits - credits + transferOut - transferIn;
  }
};

/**
 * Calculate net contributions from transfers for an account
 * 
 * @param transferIn - Sum of all incoming transfers
 * @param transferOut - Sum of all outgoing transfers
 * @param nature - Account nature: "asset" or "liability"
 * @returns Net contributions (positive for assets receiving money, positive for liabilities borrowing more)
 * 
 * For assets: netContributions = transferIn - transferOut
 * For liabilities: netContributions = transferOut - transferIn (borrowing increases, paying down decreases)
 */
export const calculateNetContributions = (
  transferIn: number,
  transferOut: number,
  nature: "asset" | "liability"
): number => {
  if (nature === "asset") {
    return transferIn - transferOut;
  } else {
    // For liabilities: transferOut (borrowing) increases liability, transferIn (paying down) decreases liability
    // Net contributions = transferOut - transferIn
    return transferOut - transferIn;
  }
};
