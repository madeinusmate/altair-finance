import { LOCAL_API_TOKEN_HEADER } from "@/lib/local-api-guard";

const PATCHED = "__netlyApiTokenFetch";

export const shouldAttachApiToken = (rawUrl: string, pageOrigin: string): boolean => {
  if (rawUrl.startsWith("/api/") || rawUrl === "/api") return true;

  try {
    const parsed = new URL(rawUrl, pageOrigin);
    const apiPath = parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
    if (!apiPath) return false;
    if (parsed.origin === pageOrigin) return true;
    return parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  } catch {
    return false;
  }
};

export const installApiTokenFetch = (): void => {
  if (typeof window === "undefined") return;

  const token = window.electron?.apiToken;
  if (!token) return;

  const current = window.fetch as typeof window.fetch & { [PATCHED]?: boolean };
  if (current[PATCHED]) return;

  const original = current.bind(window);
  const patched: typeof window.fetch & { [PATCHED]?: boolean } = (input, init) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!shouldAttachApiToken(rawUrl, window.location.origin)) {
      return original(input, init);
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(LOCAL_API_TOKEN_HEADER, token);
    return original(input, { ...init, headers });
  };

  patched[PATCHED] = true;
  window.fetch = patched;
};
