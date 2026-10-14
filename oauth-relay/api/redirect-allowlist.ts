const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);
// next dev uses 8527; Electron and `next start` use 8528.
const ALLOWED_PORTS = new Set(["8527", "8528"]);
const CONNECT_PATH = "/accounts/connect";
const DEFAULT_ORIGIN = "http://localhost:8528";

export type OAuthRedirectInput = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  state: string | null;
};

export type OAuthRedirectResult = { ok: true; location: string } | { ok: false };

const isAllowedPath = (pathname: string): boolean => {
  return pathname === "" || pathname === "/" || pathname === CONNECT_PATH;
};

// Returns the canonical loopback origin, or null when the target is not on
// the allowlist. The redirect is built from this origin, never from the raw
// state string.
export const allowedLoopbackOrigin = (value: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;
  if (!ALLOWED_PORTS.has(parsed.port)) return null;
  if (!isAllowedPath(parsed.pathname)) return null;

  const origin = `http://${host}:${parsed.port}`;
  if (parsed.origin !== origin) return null;
  return origin;
};

const decodeStateTarget = (state: string): string | null => {
  const parts = state.split("_");
  if (parts.length < 3) return null;

  const encoded = parts.slice(2).join("_").replace(/ /g, "+");
  try {
    return atob(encoded);
  } catch {
    return null;
  }
};

export const buildOAuthRedirect = (input: OAuthRedirectInput): OAuthRedirectResult => {
  let origin = DEFAULT_ORIGIN;

  if (input.state) {
    const parts = input.state.split("_");
    if (parts.length >= 3) {
      const decoded = decodeStateTarget(input.state);
      if (!decoded) return { ok: false };
      const allowed = allowedLoopbackOrigin(decoded);
      if (!allowed) return { ok: false };
      origin = allowed;
    }
  }

  const target = new URL(CONNECT_PATH, origin);
  if (target.origin !== origin || target.pathname !== CONNECT_PATH) return { ok: false };

  target.search = "";
  target.hash = "";
  if (input.code) target.searchParams.set("code", input.code);
  if (input.error) target.searchParams.set("error", input.error);
  if (input.errorDescription) target.searchParams.set("error_description", input.errorDescription);
  if (input.state) target.searchParams.set("state", input.state);

  return { ok: true, location: target.toString() };
};
