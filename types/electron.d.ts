export type BankAuthResult = {
  code?: string;
  error?: string;
  errorDescription?: string;
  state?: string;
  publicToken?: string;
  exited?: boolean;
  plaidError?: string;
  plaidErrorMessage?: string;
};

declare global {
  interface Window {
    electron?: {
      platform: string;
      apiToken?: string;
      clipboard?: {
        readText: () => string;
      };
      openBankConnect?: (url: string) => Promise<void>;
      onBankAuthResult?: (callback: (result: BankAuthResult) => void) => () => void;
    };
  }
}
