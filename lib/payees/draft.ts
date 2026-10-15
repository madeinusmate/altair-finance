import { bundledPayee } from "./bundle";
import { cleanPayee } from "./normalize";

export const payeeDraft = (
  rawName: string | null | undefined,
  icon?: string | null
): { name: string; normalizedName: string; icon: string | null; image: string | null } | null => {
  const cleaned = cleanPayee(rawName);
  if (!cleaned) return null;
  const preset = bundledPayee(cleaned.normalizedName);
  const explicitIcon = typeof icon === "string" && icon.trim() ? icon.trim() : null;
  return {
    name: preset?.name ?? cleaned.displayName,
    normalizedName: cleaned.normalizedName,
    icon: explicitIcon ?? preset?.icon ?? null,
    image: explicitIcon ? null : (preset?.image ?? null),
  };
};

// The payee string stored on the ledger. An existing payee keeps its saved name.
// Otherwise this is the name a new payee row would get. No merchant fuzzy match.
export const identityPayeeName = (
  rawName: string | null | undefined,
  known: ReadonlyArray<{ name: string; normalizedName: string }> = []
): string => {
  const draft = payeeDraft(rawName);
  if (!draft) return "";
  const existing = known.find((payee) => payee.normalizedName === draft.normalizedName);
  return existing?.name ?? draft.name;
};
