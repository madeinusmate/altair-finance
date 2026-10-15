export {};

declare global {
  interface Window {
    electron?: {
      platform: string;
      apiToken?: string;
      clipboard?: {
        readText: () => string;
      };
      openExternal?: (url: string) => Promise<void>;
    };
  }
}
