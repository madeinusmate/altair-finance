let ownerPassphrase: string | null = null;

export const getOwnerPassphrase = (): string | null => {
  return ownerPassphrase;
};

export const setOwnerPassphrase = (passphrase: string | null): void => {
  ownerPassphrase = passphrase;
};

export const booksOwnerEnabled = (): boolean => {
  return process.env.NETLY_BOOKS_OWNER === "1";
};
