import { spawn } from "child_process";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const isWindows = process.platform === "win32";
const electronCmd = isWindows ? "electron.cmd" : "electron";

const buildElectronFiles = (): void => {
  console.log("Compiling Electron files...");
  try {
    execSync("tsc -p electron/tsconfig.json", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log("✓ Electron files compiled");
  } catch (error) {
    console.error("❌ Electron compilation failed:", error);
    process.exit(1);
  }
};

const runElectron = (): void => {
  console.log("Starting Electron...");
  const mainPath = path.join(__dirname, "..", "electron", "dist", "main.js");
  const electronBin = path.join(__dirname, "..", "node_modules", ".bin", electronCmd);

  if (!fs.existsSync(mainPath)) {
    console.error(`❌ Main file not found: ${mainPath}`);
    console.error("   Make sure Electron files are compiled first.");
    process.exit(1);
  }

  const electronProcess = spawn(electronBin, [mainPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      ALTAIR_DEV_SERVER: "1",
    },
  });

  electronProcess.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    electronProcess.kill();
    process.exit(0);
  });
};

const main = (): void => {
  buildElectronFiles();
  runElectron();
};

main();
