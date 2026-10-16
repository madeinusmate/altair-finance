import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEncryptionKey } from "@/lib/api-utils";
import {
  PASSPHRASE_SERVICE,
  TOKEN_SERVICE,
  buildLaunchAgentPlist,
  deleteKeychainSecrets,
  ensureKeychainHelper,
  installLaunchAgentPlist,
  readHome,
  removeGrant,
  removeHome,
  removeLaunchAgentPlist,
  resolveKeychainHelper,
  runKeychain,
  writeGrant,
  writeHome,
} from "@/electron/owner-control";
import { setOwnerPassphrase } from "@/lib/books-owner";
import { readEnvAlias } from "@/lib/product";
import path from "path";

export const dynamic = "force-dynamic";

const ownerEnv = ():
  | {
      userData: string;
      nodePath: string;
      serverPath: string;
      appRoot: string;
      scriptPath: string;
      swiftSource: string;
    }
  | null => {
  const userData = process.env.ELECTRON_USER_DATA;
  const nodePath = readEnvAlias(process.env, "ALTAIR_NODE_PATH", "NETLY_NODE_PATH");
  const serverPath = readEnvAlias(process.env, "ALTAIR_SERVER_PATH", "NETLY_SERVER_PATH");
  const appRoot = readEnvAlias(process.env, "ALTAIR_APP_ROOT", "NETLY_APP_ROOT");
  const scriptPath = readEnvAlias(process.env, "ALTAIR_OWNER_SCRIPT", "NETLY_OWNER_SCRIPT");
  const swiftSource = readEnvAlias(process.env, "ALTAIR_KEYCHAIN_SOURCE", "NETLY_KEYCHAIN_SOURCE");
  if (!userData || !nodePath || !serverPath || !appRoot || !scriptPath || !swiftSource) {
    return null;
  }
  return { userData, nodePath, serverPath, appRoot, scriptPath, swiftSource };
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const passphrase = getEncryptionKey(request);
  if (!passphrase) {
    return NextResponse.json({ error: "Unlock Altair before creating an agent grant" }, { status: 401 });
  }

  const env = ownerEnv();
  if (!env) {
    return NextResponse.json({ error: "Open the Altair app to create an agent grant" }, { status: 400 });
  }

  try {
    const helper = await ensureKeychainHelper(env.userData, env.swiftSource);
    const token = randomBytes(32).toString("hex");
    await runKeychain(helper, "write", PASSPHRASE_SERVICE, passphrase);
    await runKeychain(helper, "write", TOKEN_SERVICE, token);
    writeGrant(env.userData, { enabled: true, stopped: false });
    writeHome({ userData: env.userData, keychainHelper: helper });
    const plist = buildLaunchAgentPlist({
      nodePath: env.nodePath,
      scriptPath: env.scriptPath,
      userData: env.userData,
      serverPath: env.serverPath,
      appRoot: env.appRoot,
      keychainHelper: helper,
      logPath: path.join(env.userData, "books-owner.log"),
    });
    installLaunchAgentPlist(plist);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not create the agent grant" }, { status: 500 });
  }
};

export const DELETE = async (): Promise<NextResponse> => {
  const userData = process.env.ELECTRON_USER_DATA ?? readHome()?.userData;
  if (!userData) {
    return NextResponse.json({ ok: true });
  }

  const helper = resolveKeychainHelper(userData, readHome()?.keychainHelper);
  try {
    await deleteKeychainSecrets(helper);
  } catch {
    // The items may already be gone.
  }

  removeGrant(userData);
  removeLaunchAgentPlist();
  removeHome();
  setOwnerPassphrase(null);
  return NextResponse.json({ ok: true });
};
