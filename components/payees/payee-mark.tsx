"use client";

import { getIconComponent } from "@/components/category-management/category-edit-dialog";
import { PayeeLogo } from "@/components/payees/payee-logo";
import { payeeLogoSlug } from "@/lib/payees/catalog";

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

  const slug = payeeLogoSlug(icon);
  if (slug) {
    return <PayeeLogo slug={slug} className="h-[70%] w-[70%] min-h-4 min-w-4 max-h-full max-w-full" />;
  }

  const glyph = getIconComponent(icon, className);
  if (glyph) return glyph;
  if (!fallback) return null;
  return <span>{fallback}</span>;
};
