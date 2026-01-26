import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const isElectronInstalled = (): boolean => {
  const electronPath = path.join(__dirname, "..", "node_modules", "electron");
  return fs.existsSync(electronPath);
};

const rebuildForNodeRuntime = (): void => {
  console.log("Rebuilding native modules for Node.js runtime...");
  try {
    execSync("pnpm rebuild better-sqlite3-multiple-ciphers", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("✓ Node.js runtime modules rebuilt successfully");
  } catch (error) {
    console.warn("⚠️  Warning: Failed to rebuild Node.js runtime modules:", error);
  }
};

const rebuildForElectron = (): void => {
  if (!isElectronInstalled()) {
    console.log("Electron not installed, skipping Electron rebuild");
    return;
  }

  console.log("Rebuilding native modules for Electron...");
  try {
    execSync("electron-rebuild", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("✓ Electron modules rebuilt successfully");
  } catch (error) {
    console.warn("⚠️  Warning: Failed to rebuild Electron modules:", error);
    console.warn("   This is usually okay if Electron is not installed yet.");
  }
};

// Rebuild for both Node.js runtime (Next.js) and Electron
rebuildForNodeRuntime();
rebuildForElectron();
