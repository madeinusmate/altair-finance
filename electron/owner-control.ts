import { spawn, execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export const KEYCHAIN_ACCOUNT = "netly";
export const PASSPHRASE_SERVICE = "netly.passphrase";
export const TOKEN_SERVICE = "netly.api-token";
export const LAUNCH_AGENT_LABEL = "com.netly.books-owner";
export const GRANT_FILE_NAME = "agent-grant.json";
export const PORT_FILE_NAME = "owner.json";
export const KEYCHAIN_HELPER_NAME = "netly-keychain";

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

export const keychainHelperArgs = (action: "write" | "read" | "delete", service: string): string[] => {
  return [action, KEYCHAIN_ACCOUNT, service];
};

export const homePointerPath = (homeDirectory = os.homedir()): string => {
  return path.join(homeDirectory, "Library", "Application Support", "Netly", "home.json");
};

export const launchAgentPlistPath = (homeDirectory = os.homedir()): string => {
  return path.join(homeDirectory, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
};

export const launchdTarget = (uid: number): string => {
  return `gui/${uid}/${LAUNCH_AGENT_LABEL}`;
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

export const readHome = (homeDirectory = os.homedir()): AgentHome | null => {
  const home = readJsonFile<AgentHome>(homePointerPath(homeDirectory));
  if (!home || typeof home.userData !== "string" || typeof home.keychainHelper !== "string") {
    return null;
  }
  return home;
};

export const writeHome = (home: AgentHome, homeDirectory = os.homedir()): void => {
  const pointer = homePointerPath(homeDirectory);
  fs.mkdirSync(path.dirname(pointer), { recursive: true });
  fs.writeFileSync(pointer, JSON.stringify(home), { mode: 0o600 });
};

export const removeHome = (homeDirectory = os.homedir()): void => {
  try {
    fs.unlinkSync(homePointerPath(homeDirectory));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
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
    NETLY_BOOKS_OWNER: "1",
    NETLY_SERVER_PATH: options.serverPath,
    NETLY_APP_ROOT: options.appRoot,
    NETLY_NODE_PATH: options.nodePath,
    NETLY_KEYCHAIN_HELPER: options.keychainHelper,
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

export const installLaunchAgentPlist = (plist: string, homeDirectory = os.homedir()): string => {
  const destination = launchAgentPlistPath(homeDirectory);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, plist, { mode: 0o644 });
  return destination;
};

export const removeLaunchAgentPlist = (homeDirectory = os.homedir()): void => {
  try {
    fs.unlinkSync(launchAgentPlistPath(homeDirectory));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }
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
