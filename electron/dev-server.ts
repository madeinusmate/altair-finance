export const DEV_SERVER_ENV = "ALTAIR_DEV_SERVER";

// Set by `pnpm dev:electron`. Packaged builds ignore it and keep `next start`.
export const electronUsesDevServer = (env: NodeJS.ProcessEnv, packaged: boolean): boolean => {
  return env[DEV_SERVER_ENV] === "1" && !packaged;
};

export const nextServeArgs = (host: string, port: number, dev: boolean): string[] => {
  if (dev) return ["dev", "--turbopack", "-H", host, "-p", String(port)];
  return ["start", "-H", host, "-p", String(port)];
};
