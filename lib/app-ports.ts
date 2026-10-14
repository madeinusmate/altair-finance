// Keep this range in sync with oauth-relay/api/redirect-allowlist.ts.
// next dev uses 8527. Electron starts at 8528 and only moves up inside this window.
export const DEV_APP_PORT = 8527;
export const APP_PORT_MIN = 8528;
export const APP_PORT_MAX = 8535;

export const isAllowedAppPort = (port: string): boolean => {
  if (!/^\d+$/.test(port)) return false;
  const value = Number(port);
  return value === DEV_APP_PORT || (value >= APP_PORT_MIN && value <= APP_PORT_MAX);
};
