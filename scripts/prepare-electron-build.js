#!/usr/bin/env node
// Script to prepare node_modules for electron-builder by creating stub package.json files
// for optional dependencies that pnpm doesn't install on the current platform

const fs = require('fs');
const path = require('path');

// These are the optional dependencies that electron-builder tries to scan
// but don't exist on macOS ARM64
const optionalDeps = [
  { name: '@next/swc-darwin-x64', version: '16.1.4' },
  { name: '@next/swc-linux-arm64-gnu', version: '16.1.4' },
  { name: '@next/swc-linux-arm64-musl', version: '16.1.4' },
  { name: '@next/swc-linux-x64-gnu', version: '16.1.4' },
  { name: '@next/swc-linux-x64-musl', version: '16.1.4' },
  { name: '@next/swc-win32-arm64-msvc', version: '16.1.4' },
  { name: '@next/swc-win32-x64-msvc', version: '16.1.4' },
  { name: '@img/sharp-libvips-darwin-x64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-arm', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-arm64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-ppc64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-riscv64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-s390x', version: '1.2.4' },
  { name: '@img/sharp-libvips-linux-x64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linuxmusl-arm64', version: '1.2.4' },
  { name: '@img/sharp-libvips-linuxmusl-x64', version: '1.2.4' },
  { name: '@img/sharp-win32-arm64', version: '0.34.5' },
  { name: '@img/sharp-win32-ia32', version: '0.34.5' },
  { name: '@img/sharp-win32-x64', version: '0.34.5' },
  { name: '@img/sharp-darwin-x64', version: '0.34.5' },
  { name: '@img/sharp-libvips-darwin-x64', version: '1.2.4' },
  { name: '@img/sharp-linux-arm', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-arm', version: '1.2.4' },
  { name: '@img/sharp-linux-arm64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-arm64', version: '1.2.4' },
  { name: '@img/sharp-linux-ppc64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-ppc64', version: '1.2.4' },
  { name: '@img/sharp-linux-riscv64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-riscv64', version: '1.2.4' },
  { name: '@img/sharp-linux-s390x', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-s390x', version: '1.2.4' },
  { name: '@img/sharp-linux-x64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linux-x64', version: '1.2.4' },
  { name: '@img/sharp-linuxmusl-arm64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linuxmusl-arm64', version: '1.2.4' },
  { name: '@img/sharp-linuxmusl-x64', version: '0.34.5' },
  { name: '@img/sharp-libvips-linuxmusl-x64', version: '1.2.4' },
  { name: '@img/sharp-wasm32', version: '0.34.5' },
  { name: '@emnapi/runtime', version: '1.8.1' },
  // wrap-ansi is a transitive dependency that electron-builder sometimes can't resolve
  { name: 'wrap-ansi', version: '7.0.0' },
];

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const pnpmPath = path.join(nodeModulesPath, '.pnpm');

if (!fs.existsSync(pnpmPath)) {
  console.log('pnpm structure not found, skipping optional dependency stubs');
  process.exit(0);
}

let created = 0;
for (const dep of optionalDeps) {
  // electron-builder expects @scope+package@version format
  // e.g., @next/swc-darwin-x64 becomes @next+swc-darwin-x64@16.1.4
  const depEscaped = dep.name.replace('/', '+'); // Keep the @ prefix
  const pnpmDirName = `${depEscaped}@${dep.version}`;
  const pnpmDirPath = path.join(pnpmPath, pnpmDirName);
  const fullPath = path.join(pnpmDirPath, 'node_modules', dep.name);
  const packageJsonPath = path.join(fullPath, 'package.json');
  
  // Only create stub if the directory doesn't exist (it's an optional dep not installed)
  if (!fs.existsSync(pnpmDirPath)) {
    try {
      // Create the full directory structure
      fs.mkdirSync(fullPath, { recursive: true });
      
      // Create a minimal package.json stub
      const stubPkg = {
        name: dep.name,
        version: dep.version,
        description: 'Optional dependency stub for electron-builder',
        optionalDependencies: {},
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(stubPkg, null, 2));
      created++;
    } catch (err) {
      // Ignore errors, these are optional
      console.error(`Failed to create stub for ${dep.name}:`, err.message);
    }
  } else if (fs.existsSync(pnpmDirPath) && !fs.existsSync(packageJsonPath)) {
    // Directory exists but package.json is missing
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      const stubPkg = {
        name: dep.name,
        version: dep.version,
        description: 'Optional dependency stub for electron-builder',
      };
      fs.writeFileSync(packageJsonPath, JSON.stringify(stubPkg, null, 2));
      created++;
    } catch (err) {
      // Ignore errors
    }
  }
}

if (created > 0) {
  console.log(`Created ${created} stub package.json files for optional dependencies`);
} else {
  console.log('No stub files needed (all optional dependencies already exist)');
}
