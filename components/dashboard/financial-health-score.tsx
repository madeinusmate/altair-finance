"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";
import { type DashboardDateRange } from "./dashboard-date-selector";

interface FinancialHealthScoreProps {
  dateRange: DashboardDateRange;
}

export const FinancialHealthScore = ({ dateRange }: FinancialHealthScoreProps) => {
  // Placeholder data
  const score = 72;
  const achievements = [
    "Saved money for this month",
    "Saved Money for the Retirement",
    "Good Manage of Salary",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Financial Health Score</CardTitle>
        <CardDescription>Your financial wellness overview</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center space-y-6 py-4">
          {/* Circular Progress Indicator */}
          <div className="relative flex h-48 w-48 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - score / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold">{score}%</div>
              <div className="text-sm text-muted-foreground">Saved</div>
            </div>
          </div>

          {/* Achievement Message */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              You&apos;re on track to reach your retirement goal 3 years early.
            </p>
          </div>

          {/* Achievements List */}
          <div className="w-full space-y-2">
            {achievements.map((achievement, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">{achievement}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
