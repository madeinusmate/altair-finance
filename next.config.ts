import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A fresh first-run server can sit beside `pnpm dev`, which already holds `.next/dev/lock`.
  distDir: process.env.NETLY_DATA_DIR ? ".next-fresh" : ".next",
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
