import { isAvatarDataUrl } from "@/lib/user-profile";
import { validateIcon } from "@/lib/validators/category-validators";

export const parseAccountIcon = (
  value: unknown
): { ok: true; icon: string | null } | { ok: false; error: string } => {
  if (value === null || value === undefined || value === "") {
    return { ok: true, icon: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Choose a valid icon." };
  }

  const icon = value.trim();
  const result = validateIcon(icon);
  if (!result.valid) {
    return { ok: false, error: result.error ?? "Choose a valid icon." };
  }
  return { ok: true, icon };
};

export const parseAccountIconImage = (
  value: unknown
): { ok: true; iconImage: string | null } | { ok: false; error: string } => {
  if (value === null || value === undefined || value === "") {
    return { ok: true, iconImage: null };
  }
  if (typeof value !== "string" || !isAvatarDataUrl(value)) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
  }
  return { ok: true, iconImage: value };
};
