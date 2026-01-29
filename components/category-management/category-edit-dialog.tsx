"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

interface CategoryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: {
    id: number;
    name: string;
    color?: string | null;
    icon?: string | null;
    identifier?: string;
  } | null;
  type: "transaction" | "account";
  onSuccess: () => void;
}

export const CategoryEditDialog = ({
  open,
  onOpenChange,
  category,
  type,
  onSuccess,
}: CategoryEditDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [color, setColor] = useState("");
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (category) {
      setName(category.name || "");
      setIdentifier(category.identifier || "");
      setColor(category.color || "");
      setIcon(category.icon || "");
    } else {
      setName("");
      setIdentifier("");
      setColor("");
      setIcon("");
    }
    setError(null);
  }, [category, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const endpoint =
        type === "transaction"
          ? "/api/transaction-categories"
          : "/api/account-categories";

      if (category) {
        // Update
        const body: any = { id: category.id };
        if (name) body.name = name;
        if (color !== undefined) body.color = color || null;
        if (icon !== undefined) body.icon = icon || null;
        if (type === "account" && identifier) body.identifier = identifier;

        await apiClient.put(endpoint, body);
        toast.success("Category updated successfully");
      } else {
        // Create
        const body: any = { name };
        if (color) body.color = color;
        if (icon) body.icon = icon;
        if (type === "account") {
          if (!identifier) {
            throw new Error("Identifier is required for account categories");
          }
          body.identifier = identifier;
        }

        await apiClient.post(endpoint, body);
        toast.success("Category created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : category
            ? "Failed to update category"
            : "Failed to create category";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit Category" : "Create Category"}
          </DialogTitle>
          <DialogDescription>
            {category
              ? "Update the category details below."
              : `Create a new ${type} category.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {type === "account" && (
            <div className="space-y-2">
              <Label htmlFor="identifier">Identifier (snake_case)</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g., credit_card"
                disabled={isLoading || !!category}
                required={!category}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only. Cannot be changed after creation.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Food & Drink"
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color (hex)</Label>
            <Input
              id="color"
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#FF5733"
              disabled={isLoading}
            />
            {color && (
              <div
                className="h-8 w-16 rounded border"
                style={{ backgroundColor: color }}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">Icon (lucide-react name)</Label>
            <Input
              id="icon"
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g., shopping-cart"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Icon name from lucide-react library (optional)
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {category ? "Updating..." : "Creating..."}
                </>
              ) : (
                category ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
