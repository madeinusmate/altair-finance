import { isSupportedCurrency, SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/currencies";

export const PROFILE_UPDATED_EVENT = "altair-profile-updated";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_NAME_LENGTH = 80;
export const MAX_AVATAR_DATA_URL_LENGTH = 150_000;

export type UserProfile = {
  name: string;
  email: string | null;
  avatar: string | null;
  preferredCurrency: SupportedCurrency | null;
  enabledCurrencies: SupportedCurrency[];
};

export const isAvatarDataUrl = (value: string): boolean => {
  return value.length <= MAX_AVATAR_DATA_URL_LENGTH && AVATAR_PATTERN.test(value);
};

export const parseProfileInput = (input: {
  name: unknown;
  email: unknown;
  avatar: unknown;
  preferredCurrency: unknown;
}): { ok: true; profile: UserProfile } | { ok: false; error: string } => {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) {
    return { ok: false, error: "Enter your name." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: "Name must be 80 characters or fewer." };
  }

  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email.length > 254 || (email.length > 0 && !EMAIL_PATTERN.test(email))) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const currency = typeof input.preferredCurrency === "string" ? input.preferredCurrency.trim().toUpperCase() : "";
  if (currency.length > 0 && !isSupportedCurrency(currency)) {
    return { ok: false, error: "Choose a supported currency." };
  }

  let avatar: string | null = null;
  if (input.avatar !== null && input.avatar !== undefined && input.avatar !== "") {
    if (typeof input.avatar !== "string" || !isAvatarDataUrl(input.avatar)) {
      return { ok: false, error: "Use a JPEG, PNG, or WebP photo." };
    }
    avatar = input.avatar;
  }

  return {
    ok: true,
    profile: {
      name,
      email: email.length > 0 ? email : null,
      avatar,
      preferredCurrency: currency.length > 0 && isSupportedCurrency(currency) ? currency : null,
      enabledCurrencies: [...SUPPORTED_CURRENCIES],
    },
  };
};
