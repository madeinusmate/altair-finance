import { defaultPayees } from "./catalog";
import { GENERIC_PAYEE_ICONS } from "./icon-payees";
import { PAYEE_BUNDLE_IMAGES } from "./images";
import { cleanPayee } from "./normalize";

export type BundledPayee = {
  name: string;
  normalizedName: string;
  icon: string | null;
  image: string | null;
};

const bundledPayeeList = (): BundledPayee[] => {
  const rows: BundledPayee[] = defaultPayees().map((payee) => ({
    name: payee.name,
    normalizedName: payee.normalizedName,
    icon: payee.icon,
    image: PAYEE_BUNDLE_IMAGES[payee.normalizedName]?.image ?? null,
  }));
  const seen = new Set(rows.map((payee) => payee.normalizedName));

  for (const [normalizedName, entry] of Object.entries(PAYEE_BUNDLE_IMAGES)) {
    if (seen.has(normalizedName)) continue;
    const cleaned = cleanPayee(entry.title);
    if (!cleaned || seen.has(cleaned.normalizedName)) continue;
    seen.add(cleaned.normalizedName);
    rows.push({
      name: cleaned.displayName,
      normalizedName: cleaned.normalizedName,
      icon: null,
      image: entry.image,
    });
  }

  for (const generic of GENERIC_PAYEE_ICONS) {
    const cleaned = cleanPayee(generic.name);
    if (!cleaned || seen.has(cleaned.normalizedName)) continue;
    seen.add(cleaned.normalizedName);
    rows.push({
      name: cleaned.displayName,
      normalizedName: cleaned.normalizedName,
      icon: generic.icon,
      image: null,
    });
  }

  return rows;
};

const bundledByNormalized = new Map(bundledPayeeList().map((payee) => [payee.normalizedName, payee]));

export const bundledPayees = (): BundledPayee[] => [...bundledByNormalized.values()];

export const bundledPayee = (normalizedName: string): BundledPayee | null =>
  bundledByNormalized.get(normalizedName) ?? null;
