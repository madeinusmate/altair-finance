import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  GRANT_FILE_NAME,
  PASSPHRASE_SERVICE,
  buildLaunchAgentPlist,
  installLaunchAgentPlist,
  keychainHelperArgs,
  keychainReadTargets,
  readHome,
  readPlistAppRoot,
  readGrant,
  resolveMacUserDataDir,
  writeGrant,
  writeHome,
  writePortFile,
  readAgentStatus,
} from "../electron/owner-control";

describe("agent grant files", () => {
  it("writes the grant without secrets and reports it stopped", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "altair-grant-"));
    writeGrant(userData, { enabled: true, stopped: true });
    const raw = fs.readFileSync(path.join(userData, GRANT_FILE_NAME), "utf8");
    assert.equal(raw.includes("passphrase"), false);
    assert.deepEqual(readGrant(userData), { enabled: true, stopped: true });
    assert.deepEqual(readAgentStatus(userData), { enabled: true, stopped: true, running: false });
  });

  it("treats a dead owner pid as not running", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "altair-grant-"));
    writeGrant(userData, { enabled: true, stopped: false });
    writePortFile(userData, { port: 8528, pid: 99999999 });
    assert.equal(readAgentStatus(userData).running, false);
  });
});

describe("keychain helper", () => {
  it("does not put the secret in the helper arguments", () => {
    const args = keychainHelperArgs("write", PASSPHRASE_SERVICE);
    assert.deepEqual(args, ["write", "altair", PASSPHRASE_SERVICE]);
    assert.equal(args.join(" ").includes("hunter2"), false);
  });
});

describe("launch agent plist", () => {
  it("starts the books owner without the passphrase", () => {
    const plist = buildLaunchAgentPlist({
      nodePath: "/usr/bin/node",
      scriptPath: "/Applications/Altair.app/Contents/Resources/books-owner.mjs",
      userData: "/Users/me/Library/Application Support/Altair",
      serverPath: "/Applications/Altair.app/Contents/Resources/app.asar.unpacked/node_modules/next/dist/bin/next",
      appRoot: "/Applications/Altair.app/Contents/Resources/app.asar.unpacked",
      keychainHelper: "/Users/me/Library/Application Support/Altair/altair-keychain",
      logPath: "/Users/me/Library/Application Support/Altair/books-owner.log",
    });
    assert.match(plist, /ALTAIR_BOOKS_OWNER/);
    assert.equal(plist.includes("PRAGMA"), false);
    assert.equal(plist.includes("passphrase"), false);
    assert.equal(
      readPlistAppRoot(plist),
      "/Applications/Altair.app/Contents/Resources/app.asar.unpacked",
    );
  });

  it("still reads the app root from a Netly launch agent", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NETLY_APP_ROOT</key>
  <string>/Applications/Netly.app/Contents/Resources/app.asar.unpacked</string>
</dict></plist>`;
    assert.equal(
      readPlistAppRoot(plist),
      "/Applications/Netly.app/Contents/Resources/app.asar.unpacked",
    );
  });

  it("replaces the Netly launch agent file when the Altair plist is installed", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "altair-launch-"));
    const legacy = path.join(home, "Library", "LaunchAgents", "com.netly.books-owner.plist");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "old");
    const written = installLaunchAgentPlist("<plist/>", home);
    assert.equal(path.basename(written), "com.altair.books-owner.plist");
    assert.equal(fs.existsSync(written), true);
    assert.equal(fs.existsSync(legacy), false);
  });
});

describe("existing Netly install", () => {
  it("reads the agent grant pointer from Application Support/Netly", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "altair-home-"));
    const userData = path.join(home, "Library", "Application Support", "Netly");
    fs.mkdirSync(userData, { recursive: true });
    writeHome({ userData, keychainHelper: path.join(userData, "netly-keychain") }, home);
    fs.renameSync(
      path.join(home, "Library", "Application Support", "Altair", "home.json"),
      path.join(userData, "home.json"),
    );
    fs.rmSync(path.join(home, "Library", "Application Support", "Altair"), { recursive: true });
    assert.equal(readHome(home)?.userData, userData);
  });

  it("keeps using the Netly support directory until Altair has books", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "altair-support-"));
    const legacy = path.join(home, "Library", "Application Support", "Netly");
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "netly.db"), "");
    assert.equal(resolveMacUserDataDir(home), legacy);

    const next = path.join(home, "Library", "Application Support", "Altair");
    fs.mkdirSync(next, { recursive: true });
    fs.writeFileSync(path.join(next, "altair.db"), "");
    assert.equal(resolveMacUserDataDir(home), next);
  });

  it("reads a Netly keychain item when the Altair item is missing", () => {
    assert.deepEqual(keychainReadTargets("token"), [
      { account: "altair", service: "altair.api-token" },
      { account: "netly", service: "netly.api-token" },
    ]);
  });
});
