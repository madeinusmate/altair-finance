import { booksOwnerEnabled, setOwnerPassphrase } from "@/lib/books-owner";
import { validateKey } from "@/lib/db";
import { validateEncryptionKey } from "@/lib/encryption";
import { readKeychainSecret } from "@/electron/owner-control";
import { readEnvAlias } from "@/lib/product";

export const loadBooksOwner = async (): Promise<void> => {
  if (!booksOwnerEnabled()) return;

  const helper = readEnvAlias(process.env, "ALTAIR_KEYCHAIN_HELPER", "NETLY_KEYCHAIN_HELPER");
  if (!helper) return;

  try {
    const token = (await readKeychainSecret(helper, "token")).trim();
    const passphrase = await readKeychainSecret(helper, "passphrase");
    if (!token || !validateEncryptionKey(passphrase) || !validateKey(passphrase)) {
      return;
    }
    process.env.ALTAIR_API_TOKEN = token;
    setOwnerPassphrase(passphrase);
    // Keep the write in this function. The production bundler drops a call
    // whose only effect is a variable in another module.
    (globalThis as typeof globalThis & { "altair.ownerPassphrase"?: string | null })["altair.ownerPassphrase"] = passphrase;
  } catch {
    console.error("[Books owner] Could not open the books");
  }
};
