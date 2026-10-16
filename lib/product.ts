// Names the running app uses, plus the Netly names an existing install still has.

export const PRODUCT_NAME = "Altair";
export const LEGACY_PRODUCT_NAME = "Netly";

export const DB_FILENAME = "altair.db";
export const LEGACY_DB_FILENAME = "netly.db";

export const DATA_DIR_ENV = "ALTAIR_DATA_DIR";
export const LEGACY_DATA_DIR_ENV = "NETLY_DATA_DIR";

export const API_TOKEN_ENV = "ALTAIR_API_TOKEN";
export const LEGACY_API_TOKEN_ENV = "NETLY_API_TOKEN";

export const API_TOKEN_HEADER = "x-altair-token";
export const LEGACY_API_TOKEN_HEADER = "x-netly-token";

export const BOOKS_OWNER_ENV = "ALTAIR_BOOKS_OWNER";
export const LEGACY_BOOKS_OWNER_ENV = "NETLY_BOOKS_OWNER";

export const KEYCHAIN_HELPER_ENV = "ALTAIR_KEYCHAIN_HELPER";
export const LEGACY_KEYCHAIN_HELPER_ENV = "NETLY_KEYCHAIN_HELPER";

export const NODE_PATH_ENV = "ALTAIR_NODE_PATH";
export const LEGACY_NODE_PATH_ENV = "NETLY_NODE_PATH";
export const SERVER_PATH_ENV = "ALTAIR_SERVER_PATH";
export const LEGACY_SERVER_PATH_ENV = "NETLY_SERVER_PATH";
export const APP_ROOT_ENV = "ALTAIR_APP_ROOT";
export const LEGACY_APP_ROOT_ENV = "NETLY_APP_ROOT";
export const OWNER_SCRIPT_ENV = "ALTAIR_OWNER_SCRIPT";
export const LEGACY_OWNER_SCRIPT_ENV = "NETLY_OWNER_SCRIPT";
export const KEYCHAIN_SOURCE_ENV = "ALTAIR_KEYCHAIN_SOURCE";
export const LEGACY_KEYCHAIN_SOURCE_ENV = "NETLY_KEYCHAIN_SOURCE";
export const CLI_PATH_ENV = "ALTAIR_CLI_PATH";
export const LEGACY_CLI_PATH_ENV = "NETLY_CLI_PATH";

export const KEYCHAIN_ACCOUNT = "altair";
export const LEGACY_KEYCHAIN_ACCOUNT = "netly";
export const PASSPHRASE_SERVICE = "altair.passphrase";
export const LEGACY_PASSPHRASE_SERVICE = "netly.passphrase";
export const TOKEN_SERVICE = "altair.api-token";
export const LEGACY_TOKEN_SERVICE = "netly.api-token";

export const LAUNCH_AGENT_LABEL = "com.altair.books-owner";
export const LEGACY_LAUNCH_AGENT_LABEL = "com.netly.books-owner";

export const KEYCHAIN_HELPER_NAME = "altair-keychain";
export const LEGACY_KEYCHAIN_HELPER_NAME = "netly-keychain";

export const OWNER_PASSPHRASE_KEY = "altair.ownerPassphrase";
export const SESSION_KEY = "altair_encryption_key";
export const LEGACY_SESSION_KEY = "netly_encryption_key";

export const readEnvAlias = (
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  name: string,
  legacyName: string,
): string | undefined => {
  const current = env[name];
  if (typeof current === "string" && current.length > 0) return current;
  const legacy = env[legacyName];
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  return undefined;
};
