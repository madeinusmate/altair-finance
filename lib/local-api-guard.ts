import { timingSafeEqual } from "crypto";
import { readEnvAlias } from "@/lib/product";

export const LOCAL_API_TOKEN_HEADER = "x-altair-token";
export const LEGACY_LOCAL_API_TOKEN_HEADER = "x-netly-token";

export type LocalApiEnv = {
  ELECTRON_USER_DATA?: string;
  ALTAIR_API_TOKEN?: string;
  NETLY_API_TOKEN?: string;
};

export type LocalApiDecision =
  | { ok: true }
  | { ok: false; status: 401; error: string };

const readEnv = (env: NodeJS.ProcessEnv | LocalApiEnv, name: keyof LocalApiEnv): string | undefined => {
  const value = env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const readApiToken = (env: NodeJS.ProcessEnv | LocalApiEnv = process.env): string | undefined => {
  return readEnvAlias(env, "ALTAIR_API_TOKEN", "NETLY_API_TOKEN");
};

export const providedLocalApiToken = (headers: { get(name: string): string | null }): string | null => {
  return headers.get(LOCAL_API_TOKEN_HEADER) ?? headers.get(LEGACY_LOCAL_API_TOKEN_HEADER);
};

export const localApiTokenRequired = (env: NodeJS.ProcessEnv | LocalApiEnv = process.env): boolean => {
  return Boolean(readEnv(env, "ELECTRON_USER_DATA") || readApiToken(env));
};

export const tokensMatch = (provided: string | null, expected: string | undefined): boolean => {
  if (!expected || !provided) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
};

// Fail closed when Electron spawned the server. Plain `next dev` leaves both
// env vars unset so browser development keeps working.
export const authorizeLocalApiRequest = (
  provided: string | null,
  env: NodeJS.ProcessEnv | LocalApiEnv = process.env
): LocalApiDecision => {
  if (!localApiTokenRequired(env)) return { ok: true };

  const expected = readApiToken(env);
  if (!expected || !tokensMatch(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
};
