"use client";

import { getIconComponent } from "@/components/category-management/category-edit-dialog";
import { PayeeLogo } from "@/components/payees/payee-logo";
import { payeeLogoSlug } from "@/lib/payees/catalog";
import { cn } from "@/lib/utils";

type PayeeMarkProps = {
  image?: string | null;
  icon?: string | null;
  fallback: string;
  className?: string;
};

// The frame has an explicit size and the photo is taken out of flow.
// A percentage-sized image inside a table cell otherwise grows to its layout box and upscales the 64px asset.
export const PayeeMark = ({ image, icon, fallback, className }: PayeeMarkProps) => {
  const slug = image ? null : payeeLogoSlug(icon);
  const glyph = image || slug ? null : getIconComponent(icon, "size-[60%]");
  if (!image && !slug && !glyph && !fallback) return null;

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium leading-none",
        className
      )}
    >
      {image ? (
        // Data URLs are stored locally and are not a remote image source.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : slug ? (
        <PayeeLogo slug={slug} className="size-[60%]" />
      ) : (
        glyph ?? fallback
      )}
    </span>
  );
};
