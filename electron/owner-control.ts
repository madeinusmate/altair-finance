import { spawn, execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export const KEYCHAIN_ACCOUNT = "altair";
export const LEGACY_KEYCHAIN_ACCOUNT = "netly";
export const PASSPHRASE_SERVICE = "altair.passphrase";
export const LEGACY_PASSPHRASE_SERVICE = "netly.passphrase";
export const TOKEN_SERVICE = "altair.api-token";
export const LEGACY_TOKEN_SERVICE = "netly.api-token";
export const LAUNCH_AGENT_LABEL = "com.altair.books-owner";
export const LEGACY_LAUNCH_AGENT_LABEL = "com.netly.books-owner";
export const LAUNCH_AGENT_LABELS = [LAUNCH_AGENT_LABEL, LEGACY_LAUNCH_AGENT_LABEL] as const;
export const GRANT_FILE_NAME = "agent-grant.json";
export const PORT_FILE_NAME = "owner.json";
export const KEYCHAIN_HELPER_NAME = "altair-keychain";
export const LEGACY_KEYCHAIN_HELPER_NAME = "netly-keychain";

export type AgentGrantRecord = {
  enabled: boolean;
  stopped: boolean;
};

export type OwnerPortRecord = {
  port: number;
  pid: number;
};

export type AgentHome = {
  userData: string;
  keychainHelper: string;
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (command: string, args: string[], stdin?: string) => Promise<CommandResult>;

export type KeychainKind = "passphrase" | "token";

export type KeychainTarget = {
  account: string;
  service: string;
};

export const keychainHelperArgs = (action: "write" | "read" | "delete", service: string): string[] => {
  return [action, KEYCHAIN_ACCOUNT, service];
};

// New grants are stored under Altair. An existing grant stays under Netly until it is replaced.
export const keychainReadTargets = (kind: KeychainKind): KeychainTarget[] => {
  if (kind === "passphrase") {
    return [
      { account: KEYCHAIN_ACCOUNT, service: PASSPHRASE_SERVICE },
      { account: LEGACY_KEYCHAIN_ACCOUNT, service: LEGACY_PASSPHRASE_SERVICE },
    ];
  }
  return [
    { account: KEYCHAIN_ACCOUNT, service: TOKEN_SERVICE },
    { account: LEGACY_KEYCHAIN_ACCOUNT, service: LEGACY_TOKEN_SERVICE },
  ];
};

export const homePointerPath = (homeDirectory = os.homedir()): string => {
  return path.join(homeDirectory, "Library", "Application Support", "Altair", "home.json");
};

export const legacyHomePointerPath = (homeDirectory = os.homedir()): string => {
  return path.join(homeDirectory, "Library", "Application Support", "Netly", "home.json");
};

export const homePointerCandidates = (homeDirectory = os.homedir()): string[] => {
  return [homePointerPath(homeDirectory), legacyHomePointerPath(homeDirectory)];
};

export const launchAgentPlistPath = (
  homeDirectory = os.homedir(),
  label: string = LAUNCH_AGENT_LABEL,
): string => {
  return path.join(homeDirectory, "Library", "LaunchAgents", `${label}.plist`);
};

export const legacyLaunchAgentPlistPath = (homeDirectory = os.homedir()): string => {
  return launchAgentPlistPath(homeDirectory, LEGACY_LAUNCH_AGENT_LABEL);
};

export const launchdTargetFor = (uid: number, label: string): string => {
  return `gui/${uid}/${label}`;
};

export const launchdTarget = (uid: number): string => {
  return launchdTargetFor(uid, LAUNCH_AGENT_LABEL);
};

const BOOKS_MARKERS = ["altair.db", "netly.db", "agent-grant.json"];

export const directoryHasBooks = (
  dir: string,
  exists: (file: string) => boolean = fs.existsSync,
): boolean => {
  return BOOKS_MARKERS.some((name) => exists(path.join(dir, name)));
};

// Packaged Altair looks in Application Support/Altair. Keep using Netly when that
// folder already holds the books or the agent grant and Altair's folder does not.
export const resolveMacUserDataDir = (
  homeDirectory = os.homedir(),
  exists: (file: string) => boolean = fs.existsSync,
): string => {
  const nextDir = path.join(homeDirectory, "Library", "Application Support", "Altair");
  const legacyDir = path.join(homeDirectory, "Library", "Application Support", "Netly");
  if (directoryHasBooks(nextDir, exists)) return nextDir;
  if (directoryHasBooks(legacyDir, exists)) return legacyDir;
  return nextDir;
};

export const resolveKeychainHelper = (userData: string, helper?: string | null): string => {
  if (helper && fs.existsSync(helper)) return helper;
  const legacy = path.join(userData, LEGACY_KEYCHAIN_HELPER_NAME);
  if (fs.existsSync(legacy)) return legacy;
  return path.join(userData, KEYCHAIN_HELPER_NAME);
};

export const launchdDomain = (uid: number): string => {
  return `gui/${uid}`;
};

const readJsonFile = <T>(filePath: string): T | null => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const grantFilePath = (userData: string): string => {
  return path.join(userData, GRANT_FILE_NAME);
};

export const portFilePath = (userData: string): string => {
  return path.join(userData, PORT_FILE_NAME);
};

export const readGrant = (userData: string): AgentGrantRecord | null => {
  const grant = readJsonFile<AgentGrantRecord>(grantFilePath(userData));
  if (!grant || typeof grant.enabled !== "boolean" || typeof grant.stopped !== "boolean") {
    return null;
  }
  return grant;
};

export const writeGrant = (userData: string, grant: AgentGrantRecord): void => {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(grantFilePath(userData), JSON.stringify(grant), { mode: 0o600 });
};

export const removeGrant = (userData: string): void => {
  try {
    fs.unlinkSync(grantFilePath(userData));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }
};

export const readPortFile = (userData: string): OwnerPortRecord | null => {
  const record = readJsonFile<OwnerPortRecord>(portFilePath(userData));
  if (!record || !Number.isInteger(record.port) || !Number.isInteger(record.pid)) {
    return null;
  }
  return record;
};

export const writePortFile = (userData: string, record: OwnerPortRecord): void => {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(portFilePath(userData), JSON.stringify(record), { mode: 0o600 });
};

const parseHome = (filePath: string): AgentHome | null => {
  const home = readJsonFile<AgentHome>(filePath);
  if (!home || typeof home.userData !== "string" || typeof home.keychainHelper !== "string") {
    return null;
  }
  return home;
};

export const readHome = (homeDirectory = os.homedir()): AgentHome | null => {
  for (const candidate of homePointerCandidates(homeDirectory)) {
    const home = parseHome(candidate);
    if (home) return home;
  }
  return null;
};

export const writeHome = (home: AgentHome, homeDirectory = os.homedir()): void => {
  const pointer = homePointerPath(homeDirectory);
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  fs.writeFileSync(pointer, JSON.stringify(home), { mode: 0o600 });
};

const unlinkIfPresent = (filePath: string): void => {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }
};

export const removeHome = (homeDirectory = os.homedir()): void => {
  for (const candidate of homePointerCandidates(homeDirectory)) {
    unlinkIfPresent(candidate);
  }
};

export const pidIsRunning = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const readAgentStatus = (userData: string): { enabled: boolean; stopped: boolean; running: boolean } => {
  const grant = readGrant(userData);
  if (!grant?.enabled) {
    return { enabled: false, stopped: false, running: false };
  }
  if (grant.stopped) {
    return { enabled: true, stopped: true, running: false };
  }
  const port = readPortFile(userData);
  return {
    enabled: true,
    stopped: false,
    running: Boolean(port && pidIsRunning(port.pid)),
  };
};

const xmlEscape = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

export const buildLaunchAgentPlist = (options: {
  nodePath: string;
  scriptPath: string;
  userData: string;
  serverPath: string;
  appRoot: string;
  keychainHelper: string;
  logPath: string;
}): string => {
  const env = {
    ELECTRON_USER_DATA: options.userData,
    ALTAIR_BOOKS_OWNER: "1",
    ALTAIR_SERVER_PATH: options.serverPath,
    ALTAIR_APP_ROOT: options.appRoot,
    ALTAIR_NODE_PATH: options.nodePath,
    ALTAIR_KEYCHAIN_HELPER: options.keychainHelper,
  };

  const envXml = Object.entries(env)
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(options.nodePath)}</string>
    <string>${xmlEscape(options.scriptPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(options.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(options.logPath)}</string>
</dict>
</plist>
`;
};

export const spawnCommand: CommandRunner = (command, args, stdin) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (stdin !== undefined) {
      child.stdin.end(stdin);
      return;
    }
    child.stdin.end();
  });
};

export const runKeychain = async (
  helper: string,
  action: "write" | "read" | "delete",
  service: string,
  stdin?: string,
  run: CommandRunner = spawnCommand
): Promise<string> => {
  const result = await run(helper, keychainHelperArgs(action, service), action === "write" ? stdin : undefined);
  if (result.code !== 0) {
    throw new Error(`Keychain ${action} failed`);
  }
  return result.stdout;
};

export const readKeychainSecret = async (
  helper: string,
  kind: KeychainKind,
  run: CommandRunner = spawnCommand,
): Promise<string> => {
  let lastError: Error | null = null;
  for (const target of keychainReadTargets(kind)) {
    try {
      const result = await run(helper, ["read", target.account, target.service]);
      if (result.code === 0 && result.stdout.length > 0) return result.stdout;
      lastError = new Error("Keychain read failed");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Keychain read failed");
    }
  }
  throw lastError ?? new Error("Keychain read failed");
};

export const deleteKeychainSecrets = async (
  helper: string,
  run: CommandRunner = spawnCommand,
): Promise<void> => {
  const targets = [...keychainReadTargets("passphrase"), ...keychainReadTargets("token")];
  for (const target of targets) {
    await run(helper, ["delete", target.account, target.service]);
  }
};

export const ensureKeychainHelper = async (
  userData: string,
  swiftSource: string,
  run: CommandRunner = spawnCommand
): Promise<string> => {
  const destination = path.join(userData, KEYCHAIN_HELPER_NAME);
  fs.mkdirSync(userData, { recursive: true });
  const sourceTime = fs.statSync(swiftSource).mtimeMs;
  const helperExists = fs.existsSync(destination);
  const helperTime = helperExists ? fs.statSync(destination).mtimeMs : 0;
  if (!helperExists || helperTime < sourceTime) {
    const compiled = await run("swiftc", ["-O", "-o", destination, swiftSource]);
    if (compiled.code !== 0) {
      throw new Error("Could not build the keychain helper");
    }
    fs.chmodSync(destination, 0o755);
  }
  return destination;
};

export const readPlistAppRoot = (plist: string): string | null => {
  const match = plist.match(/<key>(?:ALTAIR|NETLY)_APP_ROOT<\/key>\s*<string>([^<]*)<\/string>/);
  if (!match) return null;
  return match[1]
    .replaceAll("&quot;", "\"")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
};

export const installLaunchAgentPlist = (plist: string, homeDirectory = os.homedir()): string => {
  const destination = launchAgentPlistPath(homeDirectory);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, plist, { mode: 0o644 });
  unlinkIfPresent(legacyLaunchAgentPlistPath(homeDirectory));
  return destination;
};

export const removeLaunchAgentPlist = (homeDirectory = os.homedir()): void => {
  unlinkIfPresent(launchAgentPlistPath(homeDirectory));
  unlinkIfPresent(legacyLaunchAgentPlistPath(homeDirectory));
};

export const runLaunchctl = async (args: string[], run: CommandRunner = spawnCommand): Promise<void> => {
  const result = await run("launchctl", args);
  if (result.code !== 0 && !result.stderr.includes("already") && !result.stdout.includes("already")) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "launchctl failed");
  }
};

export const currentUid = (): number => {
  return typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid;
};

export const whichNode = async (): Promise<string> => {
  const resolved = await new Promise<string>((resolve, reject) => {
    execFile("which", ["node"], (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
  if (!resolved) {
    throw new Error("node was not found");
  }
  return resolved;
};
