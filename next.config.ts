import type { NextConfig } from "next";

// Keep each dev server on its own dist dir so they do not fight over `.next/dev/lock`.
const distDir = (): string => {
  if (process.env.ALTAIR_DATA_DIR || process.env.NETLY_DATA_DIR) return ".next-fresh";
  if (process.env.ALTAIR_DEV_SERVER === "1") return ".next-electron";
  return ".next";
};

const nextConfig: NextConfig = {
  distDir: distDir(),
  serverExternalPackages: ["better-sqlite3", "better-sqlite3-multiple-ciphers", "canvas", "pdfjs-dist"],
  // Empty turbopack config to silence the warning when using --webpack flag
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure native modules are treated as externals
      config.externals = config.externals || [];
      config.externals.push({
        "better-sqlite3": "commonjs better-sqlite3",
        "better-sqlite3-multiple-ciphers": "commonjs better-sqlite3-multiple-ciphers",
      });
    }
    return config;
  },
};

export default nextConfig;
