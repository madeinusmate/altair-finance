import { booksOwnerEnabled, setOwnerPassphrase } from "@/lib/books-owner";
import { validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import { PASSPHRASE_SERVICE, TOKEN_SERVICE, runKeychain } from "@/electron/owner-control";

export const loadBooksOwner = async (): Promise<void> => {
  if (!booksOwnerEnabled()) return;

  const helper = process.env.NETLY_KEYCHAIN_HELPER;
  if (!helper) return;

  try {
    const token = (await runKeychain(helper, "read", TOKEN_SERVICE)).trim();
    const passphrase = await runKeychain(helper, "read", PASSPHRASE_SERVICE);
    if (!token || !validateEncryptionKey(passphrase) || !validateKey(passphrase)) {
      return;
    }
    process.env.NETLY_API_TOKEN = token;
    setOwnerPassphrase(passphrase);
    // Keep the write in this function. The production bundler drops a call
    // whose only effect is a variable in another module.
    (globalThis as typeof globalThis & { "netly.ownerPassphrase"?: string | null })["netly.ownerPassphrase"] = passphrase;
  } catch {
    console.error("[Books owner] Could not open the books");
  }
};
