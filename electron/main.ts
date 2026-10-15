import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { spawn, ChildProcess, execFileSync } from "child_process";
import { randomBytes } from "crypto";
import * as path from "path";
import * as fs from "fs";
import findFreePort from "find-free-port";
import waitOn from "wait-on";
import { createMenu } from "./menu";
import {
  LAUNCH_AGENT_LABEL,
  LEGACY_LAUNCH_AGENT_LABEL,
  buildLaunchAgentPlist,
  currentUid,
  installLaunchAgentPlist,
  launchAgentPlistPath,
  launchdDomain,
  launchdTargetFor,
  pidIsRunning,
  readGrant,
  readHome,
  readKeychainSecret,
  readPlistAppRoot,
  readPortFile,
  resolveKeychainHelper,
  resolveMacUserDataDir,
  runLaunchctl,
  spawnCommand,
} from "./owner-control";

app.setName("Altair");
if (process.platform === "darwin") {
  app.setPath("userData", resolveMacUserDataDir());
}

const LOCAL_HOST = "127.0.0.1";
let apiToken = randomBytes(32).toString("hex");
let serverOwnedByElectron = true;

// The window origin stays on localhost while the socket is the IPv4 loopback
// address Next binds to.
app.commandLine.appendSwitch("host-resolver-rules", "MAP localhost 127.0.0.1");

ipcMain.on("altair-get-api-token", (event) => {
  event.returnValue = apiToken;
});

// Credits links leave the app window. Only https://github.com is allowed.
const openGitHubUrl = async (value: unknown): Promise<void> => {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }

  if (url.protocol !== "https:" || url.hostname !== "github.com") return;
  if (url.port !== "" || url.username !== "" || url.password !== "") return;

  await shell.openExternal(url.toString());
};

ipcMain.handle("altair-open-external", async (_event, value: unknown) => {
  await openGitHubUrl(value);
});

let apiTokenHeaderInstalled = false;

const installApiTokenHeader = (port: number): void => {
  serverPort = port;
  if (apiTokenHeaderInstalled) return;
  apiTokenHeaderInstalled = true;

  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [`http://${LOCAL_HOST}:*/api/*`, "http://localhost:*/api/*"],
    },
    (details, callback) => {
      let requestPort = "";
      try {
        requestPort = new URL(details.url).port;
      } catch {
        requestPort = "";
      }
      if (requestPort !== String(serverPort)) {
        callback({ requestHeaders: details.requestHeaders });
        return;
      }
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "X-Altair-Token": apiToken,
        },
      });
    }
  );
};

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let serverPort: number = 8528;

const reserveLoopbackPort = async (): Promise<number> => {
  const raw = await findFreePort(8528);
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const port = Number(candidate);
  if (!Number.isInteger(port)) {
    throw new Error("No free loopback port");
  }
  return port;
};

const isAppNavigation = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "localhost" && url.port === String(serverPort);
  } catch {
    return false;
  }
};

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

const getElectronDir = (): string => {
  if (app.isPackaged) {
    // In packaged app, files are in app.asar
    return path.join(process.resourcesPath, "app.asar", "electron");
  }
  return __dirname;
};

// No longer needed - we'll use fork() which uses Electron's Node.js runtime

const createSplashWindow = (): BrowserWindow => {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = path.join(getElectronDir(), "splash.html");
  splash.loadFile(splashPath);
  splash.center();

  return splash;
};

const createMainWindow = (port: number): BrowserWindow => {
  const electronDir = getElectronDir();
  const preloadPath = path.join(electronDir, "dist", "preload.js");

  // Get icon path - use .icns for macOS, .png for others
  let iconPath: string | undefined;
  if (process.platform === "darwin") {
    // For macOS, use .icns if available, otherwise .png
    const icnsPath = app.isPackaged
      ? path.join(process.resourcesPath, "build", "icon.icns")
      : path.join(__dirname, "..", "..", "build", "icon.icns");
    const pngPath = app.isPackaged
      ? path.join(process.resourcesPath, "build", "icon.png")
      : path.join(__dirname, "..", "..", "build", "icon.png");
    iconPath = fs.existsSync(icnsPath) ? icnsPath : pngPath;
  } else {
    // For other platforms, use .png
    iconPath = app.isPackaged
      ? path.join(process.resourcesPath, "build", "icon.png")
      : path.join(__dirname, "..", "..", "build", "icon.png");
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      preload: preloadPath,
      devTools: true,
    },
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigation(url)) return;
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  const url = `http://localhost:${port}`;
  win.loadURL(url);

  win.once("ready-to-show", () => {
    win.show();
    if (isDev) {
      win.webContents.openDevTools();
    }
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
};

const getBundledNodePath = (): string | null => {
  if (!app.isPackaged) {
    return null;
  }
  
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require("child_process");
  
  // Detect current architecture
  const arch = os.arch() === "arm64" ? "arm64" : "x64";
  console.log(`[Electron] Detected architecture: ${arch}`);
  
  // In packaged app, extraResources are in process.resourcesPath
  // Try architecture-specific path first, then fallback to generic
  const possiblePaths = [
    path.join(process.resourcesPath, "node", arch, "node"), // Architecture-specific
    path.join(process.resourcesPath, "node"), // Generic fallback
  ];
  
  for (const bundledNodePath of possiblePaths) {
    try {
      if (fs.existsSync(bundledNodePath)) {
        const stats = fs.statSync(bundledNodePath);
        if (stats.isFile()) {
          // Verify it's executable and check architecture
          try {
            fs.chmodSync(bundledNodePath, 0o755);
            
            // Verify the binary architecture matches
            try {
              const fileOutput = execSync(`file "${bundledNodePath}"`, { encoding: "utf-8" });
              console.log(`[Electron] Node.js binary info: ${fileOutput.trim()}`);
              
              // Check if architecture matches
              if (arch === "arm64" && !fileOutput.includes("arm64") && !fileOutput.includes("ARM64")) {
                console.warn(`[Electron] Warning: Architecture mismatch. Expected arm64 but got: ${fileOutput}`);
                continue; // Try next path
              }
              if (arch === "x64" && !fileOutput.includes("x86_64") && !fileOutput.includes("64-bit")) {
                console.warn(`[Electron] Warning: Architecture mismatch. Expected x64 but got: ${fileOutput}`);
                continue; // Try next path
              }
            } catch {
              // file command might not be available, continue anyway
            }
            
            console.log(`[Electron] Using bundled Node.js at: ${bundledNodePath}`);
            return bundledNodePath;
          } catch (chmodError) {
            console.warn(`[Electron] Failed to set permissions on ${bundledNodePath}:`, chmodError);
            // Still return it, might work anyway
            return bundledNodePath;
          }
        }
      }
    } catch (error) {
      console.warn(`[Electron] Error checking path ${bundledNodePath}:`, error);
      // Continue to next path
    }
  }
  
  console.warn(`[Electron] No bundled Node.js found for architecture ${arch}`);
  return null;
};

const startNextServer = async (port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    let appRoot: string;
    let serverPath: string;
    let nextBuildPath: string;

    if (app.isPackaged) {
      // In packaged app, files unpacked from asar are in app.asar.unpacked
      const resourcesPath = process.resourcesPath;
      const asarUnpackedPath = path.join(resourcesPath, "app.asar.unpacked");
      
      // node_modules and .next are both unpacked to app.asar.unpacked
      const unpackedServerPath = path.join(asarUnpackedPath, "node_modules", "next", "dist", "bin", "next");
      const unpackedNextBuild = path.join(asarUnpackedPath, ".next");
      
      console.log(`[Electron] Resources path: ${resourcesPath}`);
      console.log(`[Electron] Checking unpacked path: ${asarUnpackedPath}`);
      console.log(`[Electron] Checking for Next.js at: ${unpackedServerPath}`);
      console.log(`[Electron] Checking for .next at: ${unpackedNextBuild}`);
      
      if (fs.existsSync(unpackedServerPath)) {
        appRoot = asarUnpackedPath;
        serverPath = unpackedServerPath;
        nextBuildPath = unpackedNextBuild;
        console.log(`[Electron] Found Next.js in asar.unpacked: ${serverPath}`);
      } else {
        // Try looking in app.asar (regular path)
        const asarPath = path.join(resourcesPath, "app.asar");
        appRoot = asarPath;
        serverPath = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
        nextBuildPath = path.join(appRoot, ".next");
        console.log(`[Electron] Trying asar path: ${serverPath}`);
      }
      
      // Verify .next build exists
      if (!fs.existsSync(nextBuildPath)) {
        console.warn(`[Electron] .next build not found at ${nextBuildPath}`);
        // Try alternative locations
        const altNextBuild = path.join(resourcesPath, "app.asar.unpacked", ".next");
        if (fs.existsSync(altNextBuild)) {
          nextBuildPath = altNextBuild;
          appRoot = path.join(resourcesPath, "app.asar.unpacked");
          console.log(`[Electron] Found .next at alternative path: ${nextBuildPath}`);
        }
      }
    } else {
      appRoot = path.join(__dirname, "..", "..");
      serverPath = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
      nextBuildPath = path.join(appRoot, ".next");
    }

    // Verify server path exists
    if (!fs.existsSync(serverPath)) {
      reject(new Error(
        `Next.js server not found at ${serverPath}. ` +
        `App root: ${appRoot}. ` +
        `Resources path: ${app.isPackaged ? process.resourcesPath : "N/A"}. ` +
        `Please ensure the app was built correctly.`
      ));
      return;
    }
    
    // Verify .next build exists
    if (!fs.existsSync(nextBuildPath)) {
      reject(new Error(
        `Next.js build not found at ${nextBuildPath}. ` +
        `App root: ${appRoot}. ` +
        `Please ensure the app was built with 'next build' before packaging.`
      ));
      return;
    }
    
    console.log(`[Electron] Using app root: ${appRoot}`);
    console.log(`[Electron] Using .next from: ${nextBuildPath}`);

    const args = ["start", "-H", LOCAL_HOST, "-p", port.toString()];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: "production",
      ELECTRON_USER_DATA: app.getPath("userData"),
      ALTAIR_API_TOKEN: apiToken,
    };

    // Try bundled Node.js first, then system Node.js, then "node" from PATH
    let nodeExecutable = "node";
    
    if (app.isPackaged) {
      // Try bundled Node.js first
      const bundledNode = getBundledNodePath();
      if (bundledNode) {
        nodeExecutable = bundledNode;
        console.log(`[Electron] Using bundled Node.js: ${bundledNode}`);
      } else {
        // Fallback to system Node.js locations
        const possiblePaths = [
          "/usr/local/bin/node",
          "/opt/homebrew/bin/node",
          "/usr/bin/node",
        ];
        
        for (const nodePath of possiblePaths) {
          try {
            if (fs.existsSync(nodePath)) {
              nodeExecutable = nodePath;
              console.log(`[Electron] Using system Node.js: ${nodePath}`);
              break;
            }
          } catch {
            // Continue
          }
        }
        if (nodeExecutable === "node") {
          console.log(`[Electron] Warning: Using 'node' from PATH (may not work in packaged app)`);
        }
      }
    }
    
    console.log(`[Electron] Starting Next.js server with: ${nodeExecutable} ${serverPath} ${args.join(" ")}`);
    console.log(`[Electron] Working directory: ${appRoot}`);
    console.log(`[Electron] ELECTRON_USER_DATA: ${env.ELECTRON_USER_DATA}`);

    const nodePath = nodeExecutable === "node"
      ? execFileSync("which", ["node"], { encoding: "utf8" }).trim()
      : nodeExecutable;
    const repoRoot = app.isPackaged ? appRoot : path.join(__dirname, "..", "..");
    env.ALTAIR_NODE_PATH = nodePath;
    env.ALTAIR_SERVER_PATH = serverPath;
    env.ALTAIR_APP_ROOT = appRoot;
    env.ALTAIR_OWNER_SCRIPT = app.isPackaged
      ? path.join(process.resourcesPath, "books-owner.mjs")
      : path.join(repoRoot, "scripts", "books-owner.mjs");
    env.ALTAIR_KEYCHAIN_SOURCE = app.isPackaged
      ? path.join(process.resourcesPath, "altair-keychain.swift")
      : path.join(repoRoot, "scripts", "altair-keychain.swift");
    env.ALTAIR_CLI_PATH = app.isPackaged
      ? path.join(process.resourcesPath, "altair")
      : path.join(repoRoot, "cli", "altair-bin");

    nextServer = spawn(nodeExecutable, [serverPath, ...args], {
      cwd: appRoot,
      env: env as NodeJS.ProcessEnv,
      stdio: "pipe",
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    // Write logs to file for debugging packaged apps
    const logFile = path.join(app.getPath("userData"), "nextjs-server.log");
    const appendLog = (prefix: string, msg: string) => {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logFile, `[${timestamp}] ${prefix}: ${msg}\n`);
    };
    
    appendLog("INFO", `Starting Next.js server, log file: ${logFile}`);
    appendLog("INFO", `Node executable: ${nodeExecutable}`);
    appendLog("INFO", `Server path: ${serverPath}`);
    appendLog("INFO", `App root: ${appRoot}`);
    appendLog("INFO", `ELECTRON_USER_DATA: ${env.ELECTRON_USER_DATA}`);

    nextServer?.stdout?.on("data", (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      appendLog("STDOUT", output);
      console.log(`[Next.js stdout] ${output}`);
    });

    nextServer?.stderr?.on("data", (data) => {
      const output = data.toString();
      stderrBuffer += output;
      appendLog("STDERR", output);
      console.error(`[Next.js stderr] ${output}`);
      if (output.includes("Error") || output.includes("EADDRINUSE") || output.includes("ENOENT")) {
        reject(new Error(`Next.js server error: ${output}`));
      }
    });

    nextServer?.on("error", (error: Error) => {
      // Provide a more helpful error message
      if (error.message.includes("ENOENT") && error.message.includes("node")) {
        const bundledNode = getBundledNodePath();
        if (bundledNode) {
          reject(new Error(
            `Failed to start Node.js. Bundled Node.js found at ${bundledNode} but failed to execute. ` +
            `Error: ${error.message}`
          ));
        } else {
          reject(new Error(
            "Node.js executable not found. The app should include a bundled Node.js, but it was not found. " +
            "Please ensure the app was built correctly, or install Node.js from https://nodejs.org/"
          ));
        }
      } else {
        reject(error);
      }
    });

    nextServer?.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        const errorMsg = `Next.js server exited with code ${code}. ` +
          `Stdout: ${stdoutBuffer.substring(0, 500)}. ` +
          `Stderr: ${stderrBuffer.substring(0, 500)}`;
        reject(new Error(errorMsg));
      }
    });

    // Give the server a moment to start before checking
    setTimeout(() => {
      const serverUrl = `http://${LOCAL_HOST}:${port}`;
      console.log(`[Electron] Waiting for server at ${serverUrl}...`);
      waitOn({
        resources: [serverUrl],
        interval: 500,
        timeout: 60000, // Increased timeout to 60 seconds
        window: 2000,
      })
        .then(() => {
          console.log(`[Electron] Server is ready at ${serverUrl}`);
          resolve();
        })
        .catch((error: unknown) => {
          const errorMsg = `Timeout waiting for Next.js server at ${serverUrl}. ` +
            `Stdout: ${stdoutBuffer.substring(0, 1000)}. ` +
            `Stderr: ${stderrBuffer.substring(0, 1000)}. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`;
          reject(new Error(errorMsg));
        });
    }, 1000);
  });
};

const showErrorDialog = (message: string, detail?: string): void => {
  dialog.showErrorBox("Altair Error", `${message}${detail ? `\n\n${detail}` : ""}`);
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const cliInstallPath = (): string => {
  if (app.isPackaged) return path.join(process.resourcesPath, "altair");
  return path.join(__dirname, "..", "..", "cli", "altair-bin");
};

const ownerHealthy = async (port: number, token: string): Promise<boolean> => {
  try {
    const response = await fetch(`http://${LOCAL_HOST}:${port}/api/app/status`, {
      headers: { "x-altair-token": token },
    });
    return response.status < 500 && response.status !== 401;
  } catch {
    return false;
  }
};

const readOwnerToken = async (): Promise<string | null> => {
  const home = readHome();
  const helper = resolveKeychainHelper(app.getPath("userData"), home?.keychainHelper);
  if (!fs.existsSync(helper)) return null;
  try {
    const token = (await readKeychainSecret(helper, "token")).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
};

const waitForOwner = async (userData: string, token: string): Promise<number> => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const record = readPortFile(userData);
    if (record && (await ownerHealthy(record.port, token))) return record.port;
    await sleep(200);
  }
  throw new Error("Books owner did not start");
};

const stopOwnedServer = async (): Promise<void> => {
  const child = nextServer;
  if (!child) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
  if (nextServer === child) nextServer = null;
};

const bootoutLabel = async (label: string): Promise<void> => {
  const uid = currentUid();
  const target = launchdTargetFor(uid, label);
  await runLaunchctl(["disable", target]).catch(() => undefined);
  await runLaunchctl(["bootout", target]).catch(() => undefined);
};

const bootoutOwner = async (): Promise<void> => {
  const userData = app.getPath("userData");
  await bootoutLabel(LAUNCH_AGENT_LABEL);
  await bootoutLabel(LEGACY_LAUNCH_AGENT_LABEL);
  const record = readPortFile(userData);
  if (record && pidIsRunning(record.pid)) {
    try {
      process.kill(record.pid, "SIGTERM");
    } catch {
      // The owner process has already exited.
    }
  }
};

const bootstrapOwner = async (): Promise<number> => {
  const uid = currentUid();
  const userData = app.getPath("userData");
  const token = await readOwnerToken();
  if (!token) throw new Error("Agent grant token is missing");
  apiToken = token;
  serverOwnedByElectron = false;
  await runLaunchctl(["enable", launchdTargetFor(uid, LAUNCH_AGENT_LABEL)]).catch(() => undefined);
  await runLaunchctl(["bootstrap", launchdDomain(uid), launchAgentPlistPath()]).catch(() => undefined);
  return waitForOwner(userData, token);
};

const thisAppOwnerPaths = (): {
  nodePath: string;
  scriptPath: string;
  serverPath: string;
  appRoot: string;
  userData: string;
} => {
  const userData = app.getPath("userData");
  if (app.isPackaged) {
    const appRoot = path.join(process.resourcesPath, "app.asar.unpacked");
    return {
      userData,
      appRoot,
      nodePath: getBundledNodePath() ?? "node",
      serverPath: path.join(appRoot, "node_modules", "next", "dist", "bin", "next"),
      scriptPath: path.join(process.resourcesPath, "books-owner.mjs"),
    };
  }
  const repoRoot = path.join(__dirname, "..", "..");
  return {
    userData,
    appRoot: repoRoot,
    nodePath: execFileSync("which", ["node"], { encoding: "utf8" }).trim(),
    serverPath: path.join(repoRoot, "node_modules", "next", "dist", "bin", "next"),
    scriptPath: path.join(repoRoot, "scripts", "books-owner.mjs"),
  };
};

const ownerPlistMatchesThisApp = (): boolean => {
  const appRoot = thisAppOwnerPaths().appRoot;
  if (!fs.existsSync(appRoot)) return false;
  try {
    return readPlistAppRoot(fs.readFileSync(launchAgentPlistPath(), "utf8")) === appRoot;
  } catch {
    return false;
  }
};

const retargetOwnerToThisApp = (): void => {
  const paths = thisAppOwnerPaths();
  const helper = resolveKeychainHelper(paths.userData, readHome()?.keychainHelper);
  installLaunchAgentPlist(buildLaunchAgentPlist({
    nodePath: paths.nodePath,
    scriptPath: paths.scriptPath,
    userData: paths.userData,
    serverPath: paths.serverPath,
    appRoot: paths.appRoot,
    keychainHelper: helper,
    logPath: path.join(paths.userData, "books-owner.log"),
  }));
};

const attachToOwner = async (): Promise<boolean> => {
  const userData = app.getPath("userData");
  const grant = readGrant(userData);
  if (!grant?.enabled || grant.stopped) return false;
  const token = await readOwnerToken();
  if (!token) return false;
  apiToken = token;
  serverOwnedByElectron = false;
  if (!ownerPlistMatchesThisApp()) {
    retargetOwnerToThisApp();
    await bootoutOwner();
    serverPort = await bootstrapOwner();
    return true;
  }
  const existing = readPortFile(userData);
  if (existing && (await ownerHealthy(existing.port, token))) {
    serverPort = existing.port;
    return true;
  }
  serverPort = await bootstrapOwner();
  return true;
};

const cleanup = (): void => {
  if (!serverOwnedByElectron) return;
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
};

ipcMain.handle("altair-owner-activate", async () => {
  await stopOwnedServer();
  serverPort = await bootstrapOwner();
  installApiTokenHeader(serverPort);
  if (mainWindow) {
    await mainWindow.loadURL(`http://localhost:${serverPort}`);
  }
  return { ok: true };
});

ipcMain.handle("altair-owner-stop", async () => {
  await bootoutOwner();
  serverOwnedByElectron = true;
  apiToken = randomBytes(32).toString("hex");
  serverPort = await reserveLoopbackPort();
  await startNextServer(serverPort);
  installApiTokenHeader(serverPort);
  if (mainWindow) {
    await mainWindow.loadURL(`http://localhost:${serverPort}`);
  }
  return { ok: true };
});

ipcMain.handle("altair-owner-revoke", async () => {
  await bootoutOwner();
  serverOwnedByElectron = true;
  apiToken = randomBytes(32).toString("hex");
  serverPort = await reserveLoopbackPort();
  await startNextServer(serverPort);
  installApiTokenHeader(serverPort);
  if (mainWindow) {
    await mainWindow.loadURL(`http://localhost:${serverPort}`);
  }
  return { ok: true };
});

ipcMain.handle("altair-install-command", async () => {
  const source = cliInstallPath();
  const shellCommand = `mkdir -p /usr/local/bin && ln -sfn ${JSON.stringify(source)} /usr/local/bin/altair && chmod +x ${JSON.stringify(source)}`;
  const script = `do shell script ${JSON.stringify(shellCommand)} with administrator privileges`;
  try {
    const result = await spawnCommand("osascript", ["-e", script]);
    if (result.code !== 0) {
      return { ok: false, error: result.stderr.trim() || "Could not install the altair command" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not install the altair command" };
  }
});

app.whenReady().then(async () => {
  try {
    createMenu();
    const splash = createSplashWindow();

    const attached = await attachToOwner();
    if (!attached) {
      serverOwnedByElectron = true;
      serverPort = await reserveLoopbackPort();
      await startNextServer(serverPort);
    }
    installApiTokenHeader(serverPort);

    splash.close();
    mainWindow = createMainWindow(serverPort);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showErrorDialog("Failed to start application", errorMessage);
    cleanup();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    cleanup();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    app.whenReady().then(async () => {
      try {
        const attached = await attachToOwner();
        if (!attached && !nextServer) {
          serverOwnedByElectron = true;
          serverPort = await reserveLoopbackPort();
          await startNextServer(serverPort);
        }
        installApiTokenHeader(serverPort);
        mainWindow = createMainWindow(serverPort);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        showErrorDialog("Failed to start application", errorMessage);
        cleanup();
        app.quit();
      }
    });
  }
});

app.on("before-quit", () => {
  cleanup();
});

process.on("uncaughtException", (error) => {
  showErrorDialog("Uncaught Exception", error.message);
  cleanup();
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  showErrorDialog("Unhandled Rejection", message);
  cleanup();
  app.quit();
});
