import { isAllowedAppPort } from "@/lib/app-ports";

const FALLBACK_APP_URL = "http://127.0.0.1:8527";

const loopbackOrigin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return null;
    if (url.username !== "" || url.password !== "") return null;
    const host = url.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost") return null;
    if (!isAllowedAppPort(url.port)) return null;
    return url.origin;
  } catch {
    return null;
  }
};

// Electron sets NETLY_APP_URL to the port it actually bound. That value is read
// at runtime. NEXT_PUBLIC_APP_URL is only the dev fallback.
export const getLocalAppUrl = (): string => {
  return (
    loopbackOrigin(process.env.NETLY_APP_URL) ||
    loopbackOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    loopbackOrigin(process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : undefined) ||
    FALLBACK_APP_URL
  );
};
