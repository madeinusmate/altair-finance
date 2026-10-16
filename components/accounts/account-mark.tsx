"use client";

import { getIconComponent } from "@/components/category-management/category-edit-dialog";
import { cn } from "@/lib/utils";

type AccountMarkProps = {
  name: string;
  icon?: string | null;
  iconImage?: string | null;
  className?: string;
  iconClassName?: string;
};

export const AccountMark = ({
  name,
  icon,
  iconImage,
  className,
  iconClassName = "h-4 w-4",
}: AccountMarkProps) => {
  const initial = name.trim().charAt(0).toUpperCase() || "A";
  const glyph = iconImage ? null : getIconComponent(icon, iconClassName);

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium",
        iconImage ? "bg-muted" : "avatar-mark",
        className
      )}
    >
      {iconImage ? (
        <img src={iconImage} alt="" className="h-full w-full object-cover" />
      ) : (
        glyph ?? initial
      )}
    </div>
  );
};
