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

interface AccountCategory {
  id: number;
  identifier: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AccountCategoriesTableProps {
  categories: AccountCategory[];
  onRefresh: () => void;
}

export const AccountCategoriesTable = ({
  categories,
  onRefresh,
}: AccountCategoriesTableProps) => {
  const [editingCategory, setEditingCategory] = useState<AccountCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<AccountCategory | null>(null);

  const getIconComponent = (iconName: string | null | undefined) => {
    if (!iconName) return null;
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>            
            <TableHead>Name</TableHead>
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
        type="account"
        onSuccess={() => {
          setEditingCategory(null);
          onRefresh();
        }}
      />

      <CategoryDeleteDialog
        open={!!deletingCategory}
        onOpenChange={(open) => !open && setDeletingCategory(null)}
        category={deletingCategory!}
        type="account"
        onSuccess={() => {
          setDeletingCategory(null);
          onRefresh();
        }}
      />
    </>
  );
};
