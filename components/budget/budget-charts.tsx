"use client";

import { BudgetGaugeChart } from "./budget-gauge-chart";

interface BudgetWithSpending {
  id: string | null;
  categoryId: number;
  categoryName: string;
  amount: number;
  currency: string;
  spent: number;
  remaining: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

interface BudgetChartsProps {
  budgets: BudgetWithSpending[];
  overallBudget: number;
  overallSpent: number;
  overallPercentageUsed: number;
  month: string;
  currency: string;
  isLoading?: boolean;
}

export const BudgetCharts = ({
  overallBudget,
  overallSpent,
  overallPercentageUsed,
  currency,
  isLoading,
}: BudgetChartsProps) => {
  return (
    
      <BudgetGaugeChart
        overallPercentageUsed={overallPercentageUsed}
        overallBudget={overallBudget}
        overallSpent={overallSpent}
        currency={currency}
        isLoading={isLoading}
      />
     
    
  );
};
