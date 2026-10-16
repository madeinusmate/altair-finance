#!/usr/bin/env node
// Script to download Node.js binary for bundling with Electron app
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const NODE_VERSION = "22.15.0";
const PLATFORM = process.platform;
const ARCH = process.arch === "arm64" ? "arm64" : "x64";

const getNodeUrl = () => {
  const baseUrl = `https://nodejs.org/dist/v${NODE_VERSION}`;
  
  if (PLATFORM === "darwin") {
    return {
      url: `${baseUrl}/node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz`,
      filename: `node-v${NODE_VERSION}-darwin-${ARCH}.tar.gz`,
      extractPath: `node-v${NODE_VERSION}-darwin-${ARCH}/bin/node`,
    };
  } else if (PLATFORM === "linux") {
    return {
      url: `${baseUrl}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz`,
      filename: `node-v${NODE_VERSION}-linux-${ARCH}.tar.xz`,
      extractPath: `node-v${NODE_VERSION}-linux-${ARCH}/bin/node`,
    };
  } else if (PLATFORM === "win32") {
    return {
      url: `${baseUrl}/node-v${NODE_VERSION}-win-${ARCH}.zip`,
      filename: `node-v${NODE_VERSION}-win-${ARCH}.zip`,
      extractPath: `node-v${NODE_VERSION}-win-${ARCH}/node.exe`,
    };
  }
  
  throw new Error(`Unsupported platform: ${PLATFORM}`);
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
};

const extractNode = async (archivePath, extractPath, finalPath) => {
  const nodeDir = path.dirname(finalPath);
  fs.mkdirSync(nodeDir, { recursive: true });
  
  if (archivePath.endsWith(".tar.gz")) {
    execSync(`tar -xzf "${archivePath}" -C "${nodeDir}" "${extractPath}"`, { stdio: "inherit" });
    const extractedPath = path.join(nodeDir, extractPath);
    if (fs.existsSync(extractedPath)) {
      fs.renameSync(extractedPath, finalPath);
      // Clean up extracted directory
      const extractedDir = path.dirname(extractedPath);
      if (extractedDir !== nodeDir) {
        fs.rmSync(path.dirname(extractedDir), { recursive: true, force: true });
      }
    }
  } else if (archivePath.endsWith(".tar.xz")) {
    execSync(`tar -xJf "${archivePath}" -C "${nodeDir}" "${extractPath}"`, { stdio: "inherit" });
    const extractedPath = path.join(nodeDir, extractPath);
    if (fs.existsSync(extractedPath)) {
      fs.renameSync(extractedPath, finalPath);
      const extractedDir = path.dirname(extractedPath);
      if (extractedDir !== nodeDir) {
        fs.rmSync(path.dirname(extractedDir), { recursive: true, force: true });
      }
    }
  } else if (archivePath.endsWith(".zip")) {
    execSync(`unzip -q "${archivePath}" "${extractPath}" -d "${nodeDir}"`, { stdio: "inherit" });
    const extractedPath = path.join(nodeDir, extractPath);
    if (fs.existsSync(extractedPath)) {
      fs.renameSync(extractedPath, finalPath);
      const extractedDir = path.dirname(extractedPath);
      if (extractedDir !== nodeDir) {
        fs.rmSync(path.dirname(extractedDir), { recursive: true, force: true });
      }
    }
  }
  
  // Make executable on Unix systems
  if (PLATFORM !== "win32") {
    fs.chmodSync(finalPath, 0o755);
  }
};

const downloadForArch = async (arch) => {
  const originalArch = ARCH;
  // Temporarily override ARCH for this download
  const ARCH_OVERRIDE = arch;
  
  const getNodeUrlForArch = (arch) => {
    const baseUrl = `https://nodejs.org/dist/v${NODE_VERSION}`;
    
    if (PLATFORM === "darwin") {
      return {
        url: `${baseUrl}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz`,
        filename: `node-v${NODE_VERSION}-darwin-${arch}.tar.gz`,
        extractPath: `node-v${NODE_VERSION}-darwin-${arch}/bin/node`,
      };
    } else if (PLATFORM === "linux") {
      return {
        url: `${baseUrl}/node-v${NODE_VERSION}-linux-${arch}.tar.xz`,
        filename: `node-v${NODE_VERSION}-linux-${arch}.tar.xz`,
        extractPath: `node-v${NODE_VERSION}-linux-${arch}/bin/node`,
      };
    } else if (PLATFORM === "win32") {
      return {
        url: `${baseUrl}/node-v${NODE_VERSION}-win-${arch}.zip`,
        filename: `node-v${NODE_VERSION}-win-${arch}.zip`,
        extractPath: `node-v${NODE_VERSION}-win-${arch}/node.exe`,
      };
    }
    
    throw new Error(`Unsupported platform: ${PLATFORM}`);
  };
  
  const nodeInfo = getNodeUrlForArch(arch);
  const nodeDir = path.join(__dirname, "..", "node-bin", PLATFORM, arch);
  const archivePath = path.join(nodeDir, nodeInfo.filename);
  const nodeBinaryPath = path.join(nodeDir, PLATFORM === "win32" ? "node.exe" : "node");
  
  // Skip if already exists
  if (fs.existsSync(nodeBinaryPath)) {
    console.log(`Node.js binary already exists at ${nodeBinaryPath}`);
    return;
  }
  
  console.log(`Downloading Node.js ${NODE_VERSION} for ${PLATFORM}-${arch}...`);
  console.log(`URL: ${nodeInfo.url}`);
  
  fs.mkdirSync(nodeDir, { recursive: true });
  
  try {
    await downloadFile(nodeInfo.url, archivePath);
    console.log("Download complete. Extracting...");
    await extractNode(archivePath, nodeInfo.extractPath, nodeBinaryPath);
    console.log(`Node.js binary extracted to ${nodeBinaryPath}`);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
    console.log(`✓ Node.js binary ready for bundling (${arch})`);
  } catch (error) {
    console.error(`Error downloading/extracting Node.js for ${arch}:`, error);
    throw error;
  }
};

const main = async () => {
  // For macOS builds, download arm64 (since build targets arm64 only)
  // If you need x64 support, add it back
  if (PLATFORM === "darwin") {
    try {
      await downloadForArch("arm64");
      console.log("✓ Node.js binary ready for bundling (arm64)");
    } catch (error) {
      console.error("Error downloading Node.js binary:", error);
      process.exit(1);
    }
  } else {
    // For other platforms, download for current architecture
    try {
      await downloadForArch(ARCH);
      console.log("✓ Node.js binary ready for bundling");
    } catch (error) {
      console.error("Error downloading Node.js:", error);
      process.exit(1);
    }
  }
};

main();
