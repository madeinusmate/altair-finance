export const CATEGORIES = [
  "Shopping",
  "Travel",
  "Entertainment",
  "Health & Personal Care",
  "Food & Drink",
  "Rent & Utilities",
  "Subscriptions",
  "Home Improvement",
  "Other Income",
  "Auto & Transport",
  "Fees",
  "Other Expenses",
  "Capital Gain Income",
  "Utilities",
] as const;

export type Category = (typeof CATEGORIES)[number];
