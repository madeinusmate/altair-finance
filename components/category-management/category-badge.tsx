"use client";

import { Badge } from "@/components/ui/badge";
import * as LucideIcons from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryBadgeProps {
  name: string;
  color?: string | null;
  icon?: string | null;
  variant?: "default" | "outline" | "secondary" | "destructive";
  className?: string;
}

// Helper function to get icon component
// Handles both PascalCase (ShoppingCart) and kebab-case (shopping-cart) formats
const getIconComponent = (iconName: string | null | undefined) => {
  if (!iconName) return null;
  
  // Try PascalCase first (direct match)
  let IconComponent = (LucideIcons as any)[iconName];
  
  // If not found, try converting kebab-case to PascalCase
  if (!IconComponent && iconName.includes("-")) {
    const pascalCase = iconName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
    IconComponent = (LucideIcons as any)[pascalCase];
  }
  
  return IconComponent ? <IconComponent className="h-3 w-3" /> : null;
};

export const CategoryBadge = ({
  name,
  color,
  icon,
  variant = "outline",
  className,
}: CategoryBadgeProps) => {
  const iconComponent = getIconComponent(icon);
  const badgeStyle = color
    ? {
        backgroundColor: `${color}15`, // 15 = ~8% opacity
        borderColor: color,
        color: color,
      }
    : undefined;

  return (
    <Badge
      variant={variant}
      className={cn("inline-flex items-center gap-1.5", className)}
      style={badgeStyle}
    >
      {iconComponent}
      <span>{name}</span>
    </Badge>
  );
};
