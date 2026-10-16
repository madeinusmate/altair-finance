import { LEGACY_SESSION_KEY, SESSION_KEY } from "@/lib/product";

export const readSessionKey = (): string | null => {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(LEGACY_SESSION_KEY);
};

export const writeSessionKey = (key: string): void => {
  sessionStorage.setItem(SESSION_KEY, key);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
};

export const clearSessionKey = (): void => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
};
