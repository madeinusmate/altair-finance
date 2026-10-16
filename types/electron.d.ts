export {};

declare global {
  interface Window {
    electron?: {
      platform: string;
      apiToken?: string;
      clipboard?: {
        readText: () => string;
      };
      activateOwner?: () => Promise<{ ok: boolean }>;
  stopOwner?: () => Promise<{ ok: boolean }>;
  revokeOwner?: () => Promise<{ ok: boolean }>;
  installCommand?: () => Promise<{ ok: boolean; error?: string }>;
  openExternal?: (url: string) => Promise<void>;
    };
  }
}
