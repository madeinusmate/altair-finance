import { app, BrowserWindow, dialog } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import findFreePort from "find-free-port";
import waitOn from "wait-on";
import { createMenu } from "./menu";

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let serverPort: number = 3000;

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

const getElectronDir = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app", "electron");
  }
  return __dirname;
};

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

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      devTools: true,
    },
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

const startNextServer = async (port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const appRoot = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, "..", "..");

    const serverPath = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");

    const args = ["start", "-p", port.toString()];
    const env = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: "production",
      ELECTRON_USER_DATA: app.getPath("userData"),
    };

    nextServer = spawn("node", [serverPath, ...args], {
      cwd: appRoot,
      env: env as any,
      stdio: "pipe",
    });

    nextServer?.stdout?.on("data", (data) => {
      if (isDev) {
        console.log(`[Next.js] ${data.toString()}`);
      }
    });

    nextServer?.stderr?.on("data", (data) => {
      const output = data.toString();
      if (isDev) {
        console.error(`[Next.js] ${output}`);
      }
      if (output.includes("Error") || output.includes("EADDRINUSE")) {
        reject(new Error(output));
      }
    });

    nextServer?.on("error", (error) => {
      reject(error);
    });

    nextServer?.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js server exited with code ${code}`));
      }
    });

    const serverUrl = `http://localhost:${port}`;
    waitOn({
      resources: [serverUrl],
      interval: 100,
      timeout: 30000,
      window: 1000,
    })
      .then(() => {
        resolve();
      })
      .catch((error: any) => {
        reject(error);
      });
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

    serverPort = await findFreePort(3000);

    await startNextServer(serverPort);

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
          serverPort = await findFreePort(3000);
          await startNextServer(serverPort);
        }
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
