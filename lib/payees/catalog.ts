import { cleanPayee } from "./normalize";
import { PAYEE_LOGOS } from "./logos";

export const PAYEE_LOGO_PREFIX = "logo:";

export type CatalogPayee = {
  name: string;
  normalizedName: string;
  icon: string;
};

export const payeeLogoIcon = (slug: string): string => `${PAYEE_LOGO_PREFIX}${slug}`;

export const payeeLogoSlug = (icon: string | null | undefined): string | null => {
  if (!icon?.startsWith(PAYEE_LOGO_PREFIX)) return null;
  const slug = icon.slice(PAYEE_LOGO_PREFIX.length);
  return Object.hasOwn(PAYEE_LOGOS, slug) ? slug : null;
};

const catalogPayees: CatalogPayee[] = Object.entries(PAYEE_LOGOS).flatMap(([slug, logo]) => {
  const cleaned = cleanPayee(logo.title);
  if (!cleaned) return [];
  return [{ name: cleaned.displayName, normalizedName: cleaned.normalizedName, icon: payeeLogoIcon(slug) }];
});

const catalogByNormalized = new Map(catalogPayees.map((payee) => [payee.normalizedName, payee]));

export const defaultPayees = (): CatalogPayee[] => catalogPayees;

export const catalogPayee = (normalizedName: string): CatalogPayee | null =>
  catalogByNormalized.get(normalizedName) ?? null;
