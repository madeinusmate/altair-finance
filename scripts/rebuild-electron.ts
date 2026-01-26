import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const isElectronInstalled = (): boolean => {
  const electronPath = path.join(__dirname, "..", "node_modules", "electron");
  return fs.existsSync(electronPath);
};

const rebuildNativeModules = (): void => {
  if (!isElectronInstalled()) {
    console.log("Electron not installed, skipping native module rebuild");
    return;
  }

  console.log("Rebuilding native modules for Electron...");
  try {
    execSync("electron-rebuild", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("✓ Native modules rebuilt successfully");
  } catch (error) {
    console.warn("⚠️  Warning: Failed to rebuild native modules:", error);
    console.warn("   This is usually okay if Electron is not installed yet.");
  }
};

rebuildNativeModules();
