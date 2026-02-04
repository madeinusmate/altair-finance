"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CreditCard } from "lucide-react";
import type { FinverseAccount } from "@/lib/finverse-types";
import { mapFinverseAccountType } from "@/lib/finverse-mapping";

interface AccountSelection {
  account: FinverseAccount;
  name: string;
  type: "balance" | "transaction" | "investment";
  nature: "asset" | "liability";
  category: string;
}

interface AccountSelectionStepProps {
  accounts: FinverseAccount[];
  onNext: (selections: AccountSelection[]) => void;
  onBack: () => void;
  existingFinverseAccountNumbers: string[];
}

export const AccountSelectionStep = ({
  accounts,
  onNext,
  onBack,
  existingFinverseAccountNumbers
}: AccountSelectionStepProps) => {
  const [selections, setSelections] = useState<AccountSelection[]>([]);

  const handleAccountToggle = (account: FinverseAccount) => {
    const isSelected = selections.some(s => s.account.account_id === account.account_id);

    if (isSelected) {
      setSelections(prev => prev.filter(s => s.account.account_id !== account.account_id));
    } else {
      const mapped = mapFinverseAccountType(account.account_type);
      setSelections(prev => [...prev, {
        account,
        name: account.account_name || `Account ${account.account_number_masked}`,
        type: mapped.type,
        nature: mapped.nature,
        category: mapped.category
      }]);
    }
  };

  const updateSelection = (accountId: string, field: keyof Omit<AccountSelection, "account">, value: string) => {
    setSelections(prev => prev.map(selection =>
      selection.account.account_id === accountId
        ? { ...selection, [field]: value }
        : selection
    ));
  };

  const isAccountAlreadyConnected = (account: FinverseAccount) => {
    return existingFinverseAccountNumbers.includes(account.account_number_masked);
  };

  const availableAccounts = accounts.filter(account => !isAccountAlreadyConnected(account));

  const canProceed = selections.length > 0 && selections.every(s => s.name && s.category);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-2">Select Accounts to Connect</h2>
        <p className="text-muted-foreground">
          Choose which accounts you&apos;d like to import. Only transaction accounts are supported.
        </p>
      </div>

      <div className="space-y-4">
        {availableAccounts
          .filter(acc => {
            const mapped = mapFinverseAccountType(acc.account_type);
            return mapped.type === "transaction";
          })
          .map((account) => {
            const isSelected = selections.some(s => s.account.account_id === account.account_id);
            const selection = selections.find(s => s.account.account_id === account.account_id);

            return (
              <Card key={account.account_id} className={isSelected ? "ring-2 ring-blue-500" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleAccountToggle(account)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {account.account_type.sub_type?.toLowerCase().includes("credit") ? (
                          <CreditCard className="h-5 w-5" />
                        ) : (
                          <Building2 className="h-5 w-5" />
                        )}
                        <CardTitle className="text-lg">
                          {account.account_name || `Account ${account.account_number_masked}`}
                        </CardTitle>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {account.account_number_masked} • {account.account_currency}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                {isSelected && selection && (
                  <CardContent className="space-y-4 pt-0">
                    <div>
                      <Label htmlFor={`name-${account.account_id}`}>Account Name</Label>
                      <Input
                        id={`name-${account.account_id}`}
                        value={selection.name}
                        onChange={(e) => updateSelection(account.account_id, "name", e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`nature-${account.account_id}`}>Nature</Label>
                        <Select
                          value={selection.nature}
                          onValueChange={(v) => updateSelection(account.account_id, "nature", v)}
                        >
                          <SelectTrigger id={`nature-${account.account_id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asset">Asset</SelectItem>
                            <SelectItem value="liability">Liability</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`category-${account.account_id}`}>Category</Label>
                        <Select
                          value={selection.category}
                          onValueChange={(v) => updateSelection(account.account_id, "category", v)}
                        >
                          <SelectTrigger id={`category-${account.account_id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {selection.nature === "asset" ? (
                              <>
                                <SelectItem value="checking">Checking</SelectItem>
                                <SelectItem value="savings">Savings</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="other_asset">Other Asset</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="credit_card">Credit Card</SelectItem>
                                <SelectItem value="personal_loan">Personal Loan</SelectItem>
                                <SelectItem value="auto_loan">Auto Loan</SelectItem>
                                <SelectItem value="student_loan">Student Loan</SelectItem>
                                <SelectItem value="mortgage">Mortgage</SelectItem>
                                <SelectItem value="other_liability">Other Liability</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>

      {availableAccounts.filter(acc => {
        const mapped = mapFinverseAccountType(acc.account_type);
        return mapped.type === "transaction";
      }).length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No transaction accounts available to connect.
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onNext(selections)} disabled={!canProceed}>
          Next: Preview Transactions
        </Button>
      </div>
    </div>
  );
};
