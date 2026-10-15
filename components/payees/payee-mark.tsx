"use client";

import { getIconComponent } from "@/components/category-management/category-edit-dialog";

type PayeeMarkProps = {
  image?: string | null;
  icon?: string | null;
  fallback: string;
  className?: string;
};

export const PayeeMark = ({ image, icon, fallback, className = "h-4 w-4" }: PayeeMarkProps) => {
  if (image) {
    return (
      // Data URLs are stored locally and are not a remote image source.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className="h-full w-full object-cover" />
    );
  }

  const glyph = getIconComponent(icon, className);
  if (glyph) return glyph;
  if (!fallback) return null;
  return <span>{fallback}</span>;
};
