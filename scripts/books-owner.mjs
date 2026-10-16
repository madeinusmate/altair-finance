import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const GRANT_FILE_NAME = "agent-grant.json";
const PORT_FILE_NAME = "owner.json";

const envValue = (name, legacy) => {
  const current = process.env[name];
  if (typeof current === "string" && current.length > 0) return current;
  const previous = process.env[legacy];
  if (typeof previous === "string" && previous.length > 0) return previous;
  return undefined;
};

const userData = process.env.ELECTRON_USER_DATA;
const serverPath = envValue("ALTAIR_SERVER_PATH", "NETLY_SERVER_PATH");
const appRoot = envValue("ALTAIR_APP_ROOT", "NETLY_APP_ROOT");
const nodePath = envValue("ALTAIR_NODE_PATH", "NETLY_NODE_PATH") || process.execPath;

if (!userData || !serverPath || !appRoot) {
  process.stderr.write("Books owner is missing its paths\n");
  process.exit(1);
}

const grantPath = path.join(userData, GRANT_FILE_NAME);
let grant = null;
try {
  grant = JSON.parse(fs.readFileSync(grantPath, "utf8"));
} catch {
  process.exit(0);
}

if (!grant?.enabled || grant.stopped) {
  process.exit(0);
}

const findPort = async (start) => {
  for (let port = start; port < start + 50; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error("No free loopback port");
};

const waitForPort = async (port) => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Books owner did not accept connections");
};

const port = await findPort(8528);
const child = spawn(nodePath, [serverPath, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: appRoot,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "production",
    ELECTRON_USER_DATA: userData,
    ALTAIR_BOOKS_OWNER: "1",
  },
  stdio: "inherit",
});

fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, PORT_FILE_NAME), JSON.stringify({ port, pid: child.pid ?? 0 }), {
  mode: 0o600,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

try {
  await waitForPort(port);
} catch (error) {
  child.kill();
  process.stderr.write(`${error instanceof Error ? error.message : "Books owner failed"}\n`);
  process.exit(1);
}
