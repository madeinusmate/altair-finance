import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data", "fresh");
const port = "8529";

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

console.log(`Starting a first-run server with an empty database at ${dataDir}`);
console.log(`Open http://127.0.0.1:${port}`);
console.log("data/netly.db is not used.");

const child = spawn("pnpm", ["exec", "next", "dev", "--turbopack", "-H", "127.0.0.1", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    NETLY_DATA_DIR: dataDir,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

const stop = () => {
  child.kill("SIGINT");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
