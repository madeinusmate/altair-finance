"use client";

import React, { useState, useEffect } from "react";
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
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

// Curated list of popular Lucide icons for categories
const POPULAR_ICONS = [
  "ShoppingCart",
  "UtensilsCrossed",
  "Coffee",
  "Car",
  "Home",
  "Plane",
  "Train",
  "Bus",
  "Bike",
  "Fuel",
  "Hotel",
  "Briefcase",
  "GraduationCap",
  "Heart",
  "Stethoscope",
  "Dumbbell",
  "Gamepad2",
  "Film",
  "Music",
  "Book",
  "Gift",
  "CreditCard",
  "Wallet",
  "PiggyBank",
  "TrendingUp",
  "TrendingDown",
  "DollarSign",
  "Receipt",
  "FileText",
  "Tag",
  "Tags",
  "Star",
  "Bell",
  "Mail",
  "Phone",
  "Smartphone",
  "Laptop",
  "Monitor",
  "Headphones",
  "Camera",
  "Tv",
  "Wifi",
  "Zap",
  "Lightbulb",
  "Droplet",
  "Sun",
  "Moon",
  "Cloud",
  "Umbrella",
  "Shirt",
  "ShoppingBag",
  "Package",
  "Box",
  "Archive",
  "Folder",
  "File",
  "Image",
  "Video",
  "Download",
  "Upload",
  "Share2",
  "Link",
  "Globe",
  "MapPin",
  "Navigation",
  "Compass",
  "Calendar",
  "Clock",
  "Timer",
  "AlarmClock",
  "CheckCircle2",
  "XCircle",
  "AlertCircle",
  "Info",
  "HelpCircle",
  "Settings",
  "Wrench",
  "Hammer",
  "Scissors",
  "Paintbrush",
  "Palette",
  "Pencil",
  "Calculator",
  "BarChart3",
  "LineChart",
  "PieChart",
  "Activity",
  "Target",
  "Flag",
  "Award",
  "Trophy",
  "Medal",
  "Crown",
  "Gem",
  "Sparkles",
  "Rocket",
  "Ship",
  "Anchor",
  "TreePine",
  "Flower2",
  "Leaf",
  "Cat",
  "Dog",
  "Bird",
  "PawPrint",
  "Users",
  "User",
  "Handshake",
  "ThumbsUp",
  "ThumbsDown",
  "Smile",
  "PartyPopper",
  "Cake",
  "Cookie",
  "IceCream",
  "Apple",
  "Banana",
  "Cherry",
  "Pizza",
  "Burger",
  "Sandwich",
  "Soup",
  "Salad",
  "Chicken",
  "Egg",
  "Milk",
  "Beer",
  "Wine",
  "Cocktail",
  "Tea",
  "Juice",
  "Water",
  "Battery",
  "BatteryCharging",
  "Power",
  "Plug",
  "HardDrive",
  "Database",
  "Server",
  "CloudUpload",
  "CloudDownload",
  "Building",
  "Building2",
  "Factory",
  "Store",
  "Shop",
  "Bank",
  "Hospital",
  "School",
  "University",
  "Library",
  "Museum",
  "Theater",
  "Gym",
  "Pool",
  "Tent",
  "Truck",
  "Delivery",
].sort();

// Helper function to get icon component
// Handles both PascalCase (ShoppingCart) and kebab-case (shopping-cart) formats
const getIconComponent = (iconName: string | null | undefined) => {
  if (!iconName) return null;
  
  // Try PascalCase first (direct match)
  let IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
  
  // If not found, try converting kebab-case to PascalCase
  if (!IconComponent && iconName.includes("-")) {
    const pascalCase = iconName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
    IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[pascalCase];
  }
  
  return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
};

interface CategoryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: {
    id: number;
    name: string;
    transactionType?: "debit" | "credit" | null;
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
  const [transactionType, setTransactionType] = useState<"debit" | "credit" | "transfer" | "">("");
  const [color, setColor] = useState("");
  const [icon, setIcon] = useState("");
  const [transferCount, setTransferCount] = useState(0);

  useEffect(() => {
    if (!open || type !== "transaction" || !category) {
      setTransferCount(0);
      return;
    }

    let cancelled = false;
    apiClient
      .get<{ usage: { transfers: number } }>(`/api/transaction-categories?id=${category.id}`)
      .then((data) => {
        if (!cancelled) {
          setTransferCount(data.usage.transfers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransferCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, type, category]);

  useEffect(() => {
    if (category) {
      setName(category.name || "");
      setColor(category.color || "");
      setIcon(category.icon || "");
      if (type === "transaction") {
        // Map null to "transfer" for display, otherwise use the type
        setTransactionType(
          category.transactionType === null ? "transfer" : (category.transactionType || "")
        );
      }
    } else {
      setName("");
      setTransactionType("");
      setColor("");
      setIcon("");
    }
    setError(null);
  }, [category, open, type]);

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
        const body: Record<string, unknown> = { id: category.id };
        if (name) body.name = name;
        if (color !== undefined) body.color = color || null;
        if (icon !== undefined) body.icon = icon || null;
        if (type === "transaction" && transactionType) {
          // Convert "transfer" back to null for API
          body.transactionType = transactionType === "transfer" ? null : transactionType;
        }
        // Identifier is auto-generated for account categories, no need to set it

        await apiClient.put(endpoint, body);
        toast.success("Category updated successfully");
      } else {
        // Create
        const body: Record<string, unknown> = { name };
        if (color) body.color = color;
        if (icon) body.icon = icon;
        if (type === "transaction") {
          if (!transactionType) {
            throw new Error("Transaction type is required");
          }
          // Convert "transfer" back to null for API
          body.transactionType = transactionType === "transfer" ? null : transactionType;
        }
        // Identifier is auto-generated for account categories from the name

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


          {type === "transaction" && (
            <div className="space-y-2">
              <Label htmlFor="transactionType">Transaction Type</Label>
              <Select
                value={transactionType}
                onValueChange={(value) => setTransactionType(value as "debit" | "credit" | "transfer")}
                disabled={isLoading}
                required
              >
                <SelectTrigger id="transactionType">
                  <SelectValue placeholder="Select transaction type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit (Expense)</SelectItem>
                  <SelectItem value="credit">Credit (Income)</SelectItem>
                  <SelectItem value="transfer">Transfer (Special)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Debit categories are for expenses, credit categories are for income. Transfer is a special category that bypasses type constraints.
              </p>
              {transferCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {transferCount} transfer{transferCount === 1 ? "" : "s"} use this category. Changing its type removes it from the transfer form. Existing transfers keep it until you edit them.
                </p>
              ) : null}
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
            <Label htmlFor="color">Color</Label>
            <ColorPicker
              id="color"
              value={color || ""}
              onChange={(value) => setColor(value || "")}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Choose a color for this category (optional). Leave empty to remove color.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Select
              value={icon || "__none__"}
              onValueChange={(value) => setIcon(value === "__none__" ? "" : value)}
              disabled={isLoading}
            >
              <SelectTrigger id="icon" className="w-full">
                {icon && getIconComponent(icon) ? (
                  <div className="flex items-center gap-2">
                    {getIconComponent(icon)}
                    <SelectValue>
                      {POPULAR_ICONS.find((name) => name === icon)
                        ?.replace(/([A-Z])/g, " $1")
                        .trim() || icon}
                    </SelectValue>
                  </div>
                ) : (
                  <SelectValue placeholder="Select an icon (optional)" />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">None</span>
                </SelectItem>
                {POPULAR_ICONS.map((iconName) => {
                  const IconComponent = getIconComponent(iconName);
                  const displayName = iconName.replace(/([A-Z])/g, " $1").trim();
                  return (
                    <SelectItem key={iconName} value={iconName}>
                      <div className="flex items-center gap-2">
                        {IconComponent}
                        <span>{displayName}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose an icon from the dropdown (optional)
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
            <Button
              type="submit"
              disabled={
                isLoading ||
                !name ||
                (type === "transaction" && !transactionType)
              }
            >
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
