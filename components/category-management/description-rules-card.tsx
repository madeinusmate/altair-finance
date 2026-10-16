"use client";

import { useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export type DescriptionRule = {
  id: string;
  pattern: string;
  categoryName: string;
  transactionType: "debit" | "credit" | null;
  broken?: boolean;
};

type CategoryOption = {
  name: string;
  transactionType?: "debit" | "credit" | null;
};

type RuleScope = "debit" | "credit" | "both";

interface DescriptionRulesCardProps {
  rules: DescriptionRule[];
  categories: CategoryOption[];
  onChanged: () => void;
}

const typeLabel = (transactionType: "debit" | "credit" | null): string => {
  if (transactionType === "debit") return "Debit";
  if (transactionType === "credit") return "Credit";
  return "Both";
};

export const DescriptionRulesCard = ({ rules, categories, onChanged }: DescriptionRulesCardProps) => {
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<RuleScope>("debit");
  const [categoryName, setCategoryName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    return categories.filter((category) => {
      if (!category.name.trim() || category.name === "Transfer") return false;
      if (scope === "both") return category.transactionType === "debit" || category.transactionType === "credit";
      return category.transactionType === scope;
    });
  }, [categories, scope]);

  const selectedCategory = categoryOptions.some((category) => category.name === categoryName) ? categoryName : "";

  const addRule = async () => {
    if (!description.trim() || !selectedCategory) return;
    setIsSaving(true);
    try {
      await apiClient.post("/api/categorization-rules", {
        description,
        categoryName: selectedCategory,
        transactionType: scope === "both" ? null : scope,
      });
      setDescription("");
      setCategoryName("");
      toast.success("Description rule saved");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save description rule");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRule = async (rule: DescriptionRule) => {
    setDeletingId(rule.id);
    try {
      await apiClient.delete(`/api/categorization-rules?id=${encodeURIComponent(rule.id)}`);
      toast.success("Description rule deleted");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete description rule");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Description rules</CardTitle>
        <CardDescription>
          An exact description match fills this category during import review. Rules stay on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_140px_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="rule-description">Description</Label>
            <Input
              id="rule-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Starbucks"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-type">Type</Label>
            <Select
              value={scope}
              onValueChange={(value) => {
                setScope(value as RuleScope);
                setCategoryName("");
              }}
              disabled={isSaving}
            >
              <SelectTrigger id="rule-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-category">Category</Label>
            <Select
              value={selectedCategory || undefined}
              onValueChange={setCategoryName}
              disabled={isSaving || categoryOptions.length === 0}
            >
              <SelectTrigger id="rule-category">
                <SelectValue placeholder={categoryOptions.length === 0 ? "No categories" : "Select category"} />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((category) => (
                  <SelectItem key={category.name} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={addRule} disabled={isSaving || !description.trim() || !selectedCategory}>
            {isSaving ? "Saving..." : "Add rule"}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No description rules yet. Add one here, or correct a category during import.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.pattern}</TableCell>
                  <TableCell>{typeLabel(rule.transactionType)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{rule.categoryName}</span>
                      {rule.broken ? <Badge variant="outline">Category unavailable</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRule(rule)}
                      disabled={deletingId === rule.id}
                      aria-label={`Delete rule for ${rule.pattern}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
