import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  GRANT_FILE_NAME,
  PASSPHRASE_SERVICE,
  buildLaunchAgentPlist,
  keychainHelperArgs,
  readPlistAppRoot,
  readGrant,
  writeGrant,
  writePortFile,
  readAgentStatus,
} from "../electron/owner-control";

describe("agent grant files", () => {
  it("writes the grant without secrets and reports it stopped", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "netly-grant-"));
    writeGrant(userData, { enabled: true, stopped: true });
    const raw = fs.readFileSync(path.join(userData, GRANT_FILE_NAME), "utf8");
    assert.equal(raw.includes("passphrase"), false);
    assert.deepEqual(readGrant(userData), { enabled: true, stopped: true });
    assert.deepEqual(readAgentStatus(userData), { enabled: true, stopped: true, running: false });
  });

  it("treats a dead owner pid as not running", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "netly-grant-"));
    writeGrant(userData, { enabled: true, stopped: false });
    writePortFile(userData, { port: 8528, pid: 99999999 });
    assert.equal(readAgentStatus(userData).running, false);
  });
});

describe("keychain helper", () => {
  it("does not put the secret in the helper arguments", () => {
    const args = keychainHelperArgs("write", PASSPHRASE_SERVICE);
    assert.deepEqual(args, ["write", "netly", PASSPHRASE_SERVICE]);
    assert.equal(args.join(" ").includes("hunter2"), false);
  });
});

describe("launch agent plist", () => {
  it("starts the books owner without the passphrase", () => {
    const plist = buildLaunchAgentPlist({
      nodePath: "/usr/bin/node",
      scriptPath: "/Applications/Netly.app/Contents/Resources/books-owner.mjs",
      userData: "/Users/me/Library/Application Support/Netly",
      serverPath: "/Applications/Netly.app/Contents/Resources/app.asar.unpacked/node_modules/next/dist/bin/next",
      appRoot: "/Applications/Netly.app/Contents/Resources/app.asar.unpacked",
      keychainHelper: "/Users/me/Library/Application Support/Netly/netly-keychain",
      logPath: "/Users/me/Library/Application Support/Netly/books-owner.log",
    });
    assert.match(plist, /NETLY_BOOKS_OWNER/);
    assert.equal(plist.includes("PRAGMA"), false);
    assert.equal(plist.includes("passphrase"), false);
    assert.equal(
      readPlistAppRoot(plist),
      "/Applications/Netly.app/Contents/Resources/app.asar.unpacked",
    );
  });
});
