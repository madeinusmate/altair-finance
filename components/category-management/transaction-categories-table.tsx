"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { CategoryEditDialog } from "./category-edit-dialog";
import { CategoryDeleteDialog } from "./category-delete-dialog";
import * as LucideIcons from "lucide-react";

interface TransactionCategory {
  id: number;
  name: string;
  transactionType?: "debit" | "credit" | null;
  color?: string | null;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TransactionCategoriesTableProps {
  categories: TransactionCategory[];
  onRefresh: () => void;
}

export const TransactionCategoriesTable = ({
  categories,
  onRefresh,
}: TransactionCategoriesTableProps) => {
  const [editingCategory, setEditingCategory] = useState<TransactionCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<TransactionCategory | null>(null);

  const getIconComponent = (iconName: string | null | undefined) => {
    if (!iconName) return null;
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  const getTypeDisplay = (transactionType: "debit" | "credit" | null | undefined): string => {
    if (transactionType === null || transactionType === undefined) {
      return "Transfer";
    }
    return transactionType === "debit" ? "Debit" : "Credit";
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Icon</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No categories found
              </TableCell>
            </TableRow>
          ) : (
            categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">{category.name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-muted">
                    {getTypeDisplay(category.transactionType)}
                  </span>
                </TableCell>
                <TableCell>
                  {category.color ? (
                    <div
                      className="h-6 w-12 rounded border"
                      style={{ backgroundColor: category.color }}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {getIconComponent(category.icon) || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingCategory(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingCategory(category)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <CategoryEditDialog
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        category={editingCategory}
        type="transaction"
        onSuccess={() => {
          setEditingCategory(null);
          onRefresh();
        }}
      />

      <CategoryDeleteDialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        category={deletingCategory!}
        type="transaction"
        onSuccess={() => {
          setDeletingCategory(null);
          onRefresh();
        }}
      />
    </>
  );
};
