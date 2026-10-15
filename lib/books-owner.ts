// The books owner starts in one server bundle and the API routes run in
// another. The passphrase has to live on the process so both bundles see it.
const ownerPassphraseKey = "altair.ownerPassphrase";

type OwnerGlobal = typeof globalThis & {
  [ownerPassphraseKey]?: string | null;
};

const ownerGlobal = globalThis as OwnerGlobal;

export const getOwnerPassphrase = (): string | null => {
  return ownerGlobal[ownerPassphraseKey] ?? null;
};

export const setOwnerPassphrase = (passphrase: string | null): void => {
  ownerGlobal[ownerPassphraseKey] = passphrase;
};

export const booksOwnerEnabled = (): boolean => {
  return process.env.ALTAIR_BOOKS_OWNER === "1" || process.env.NETLY_BOOKS_OWNER === "1";
};
