import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import * as path from "path";
import * as fs from "fs";
import findFreePort from "find-free-port";
import waitOn from "wait-on";
import { createMenu } from "./menu";

const LOCAL_HOST = "127.0.0.1";
const APP_PORT_MIN = 8528;
const APP_PORT_MAX = 8535;
const apiToken = randomBytes(32).toString("hex");

// Keep the window origin on localhost (the OAuth callback target) while the
// socket itself is the IPv4 loopback address Next binds to.
app.commandLine.appendSwitch("host-resolver-rules", "MAP localhost 127.0.0.1");

ipcMain.on("netly-get-api-token", (event) => {
  event.returnValue = apiToken;
});

let apiTokenHeaderPort: number | null = null;

const installApiTokenHeader = (port: number): void => {
  if (apiTokenHeaderPort === port) return;
  apiTokenHeaderPort = port;

  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        `http://${LOCAL_HOST}:${port}/api/*`,
        `http://localhost:${port}/api/*`,
      ],
    },
    (details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          "X-Netly-Token": apiToken,
        },
      });
    }
  );
};

let mainWindow: BrowserWindow | null = null;
let bankWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let serverPort: number = 8528;

type BankAuthResult = {
  code?: string;
  error?: string;
  errorDescription?: string;
  state?: string;
  publicToken?: string;
  exited?: boolean;
  plaidError?: string;
  plaidErrorMessage?: string;
};

const reserveAppPort = async (): Promise<number> => {
  const raw = await findFreePort(APP_PORT_MIN, APP_PORT_MAX, LOCAL_HOST);
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const port = Number(candidate);
  if (!Number.isInteger(port) || port < APP_PORT_MIN || port > APP_PORT_MAX) {
    throw new Error(`No free loopback port between ${APP_PORT_MIN} and ${APP_PORT_MAX}`);
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

const isBankCallback = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return false;
    if (url.port !== String(serverPort)) return false;
    return url.pathname === "/accounts/connect";
  } catch {
    return false;
  }
};

const isAllowedBankUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return false;
    if (url.port !== String(serverPort)) return false;
    return url.pathname === "/plaid-link.html";
  } catch {
    return false;
  }
};

const deliverBankResult = (rawUrl: string): void => {
  const url = new URL(rawUrl);
  const payload: BankAuthResult = {
    code: url.searchParams.get("code") || undefined,
    error: url.searchParams.get("error") || undefined,
    errorDescription: url.searchParams.get("error_description") || undefined,
    state: url.searchParams.get("state") || undefined,
    publicToken: url.searchParams.get("plaid_public_token") || undefined,
    exited: url.searchParams.get("plaid_exit") === "1",
    plaidError: url.searchParams.get("plaid_error") || undefined,
    plaidErrorMessage: url.searchParams.get("plaid_error_message") || undefined,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("netly-bank-auth-result", payload);
  }
  if (bankWindow && !bankWindow.isDestroyed()) {
    bankWindow.close();
  }
};

const bankWindowOptions = {
  parent: undefined as BrowserWindow | undefined,
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    partition: "netly-bank",
  },
};

const attachBankGuards = (contents: Electron.WebContents): void => {
  const handle = (event: Electron.Event, url: string): void => {
    if (isBankCallback(url)) {
      event.preventDefault();
      deliverBankResult(url);
      return;
    }
    if (!url.startsWith("https:") && !isAllowedBankUrl(url)) {
      event.preventDefault();
    }
  };
  contents.on("will-navigate", handle);
  contents.on("will-redirect", handle);
  contents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("https:") && !isBankCallback(url)) {
      return { action: "deny" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        ...bankWindowOptions,
        parent: mainWindow ?? undefined,
      },
    };
  });
  contents.on("did-create-window", (child) => {
    attachBankGuards(child.webContents);
  });
};

const openBankWindow = (url: string): void => {
  if (!isAllowedBankUrl(url)) return;

  if (!bankWindow || bankWindow.isDestroyed()) {
    bankWindow = new BrowserWindow({
      width: 480,
      height: 720,
      parent: mainWindow ?? undefined,
      webPreferences: bankWindowOptions.webPreferences,
    });
    attachBankGuards(bankWindow.webContents);
    bankWindow.on("closed", () => {
      bankWindow = null;
    });
  }

  void bankWindow.loadURL(url);
  bankWindow.show();
};

ipcMain.handle("netly-open-bank-connect", (event, url: unknown) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Unauthorized");
  }
  if (typeof url !== "string" || !isAllowedBankUrl(url)) {
    throw new Error("Refusing to open this address");
  }
  openBankWindow(url);
});

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
    if (isAllowedBankUrl(url)) openBankWindow(url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedBankUrl(url)) openBankWindow(url);
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
    const env = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: "production",
      ELECTRON_USER_DATA: app.getPath("userData"),
      NETLY_API_TOKEN: apiToken,
      NETLY_APP_URL: `http://127.0.0.1:${port}`,
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
  dialog.showErrorBox("Netly Error", `${message}${detail ? `\n\n${detail}` : ""}`);
};

const cleanup = (): void => {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
};

app.whenReady().then(async () => {
  try {
    createMenu();
    const splash = createSplashWindow();

    serverPort = await reserveAppPort();

    await startNextServer(serverPort);
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
        if (!nextServer) {
          serverPort = await reserveAppPort();
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
