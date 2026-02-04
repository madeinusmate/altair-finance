import { spawn, ChildProcess } from "child_process";
import { execSync } from "child_process";

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;

/**
 * Start a cloudflared tunnel to expose localhost as HTTPS
 * Returns the public HTTPS URL
 */
export const startTunnel = async (localPort: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Check if cloudflared is available
    try {
      execSync("which cloudflared", { stdio: "ignore" });
    } catch {
      reject(new Error(
        "cloudflared is not installed. Please install it:\n" +
        "  macOS: brew install cloudflared\n" +
        "  Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
      ));
      return;
    }

    console.log(`[Tunnel] Starting cloudflared tunnel for localhost:${localPort}...`);

    tunnelProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${localPort}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let outputBuffer = "";

    tunnelProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      outputBuffer += output;
      console.log(`[Tunnel] ${output.trim()}`);

      // Extract the HTTPS URL from cloudflared output
      // Format: "https://random-subdomain.trycloudflare.com"
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        console.log(`[Tunnel] Public URL: ${tunnelUrl}`);
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      console.error(`[Tunnel stderr] ${output.trim()}`);
    });

    tunnelProcess.on("error", (error) => {
      reject(new Error(`Failed to start tunnel: ${error.message}`));
    });

    tunnelProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Tunnel process exited with code ${code}`));
      }
    });

    // Timeout after 10 seconds if no URL is found
    setTimeout(() => {
      if (!tunnelUrl) {
        tunnelProcess?.kill();
        reject(new Error(
          "Tunnel started but no URL was found. Output:\n" + outputBuffer.substring(0, 500)
        ));
      }
    }, 10000);
  });
};

/**
 * Stop the tunnel process
 */
export const stopTunnel = (): void => {
  if (tunnelProcess) {
    console.log("[Tunnel] Stopping tunnel...");
    tunnelProcess.kill();
    tunnelProcess = null;
    tunnelUrl = null;
  }
};

/**
 * Get the current tunnel URL if available
 */
export const getTunnelUrl = (): string | null => {
  return tunnelUrl;
};

/**
 * Check if cloudflared is available
 */
export const isTunnelAvailable = (): boolean => {
  try {
    execSync("which cloudflared", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
