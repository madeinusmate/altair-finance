import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { getDbPath, resolveDbFile } from "../lib/db";

describe("database path", () => {
  const previousDataDir = process.env.ALTAIR_DATA_DIR;
  const previousLegacyDir = process.env.NETLY_DATA_DIR;
  const previousElectron = process.env.ELECTRON_USER_DATA;

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.ALTAIR_DATA_DIR;
    else process.env.ALTAIR_DATA_DIR = previousDataDir;
    if (previousLegacyDir === undefined) delete process.env.NETLY_DATA_DIR;
    else process.env.NETLY_DATA_DIR = previousLegacyDir;
    if (previousElectron === undefined) delete process.env.ELECTRON_USER_DATA;
    else process.env.ELECTRON_USER_DATA = previousElectron;
  });

  it("uses ALTAIR_DATA_DIR ahead of NETLY_DATA_DIR and the Electron user-data directory", () => {
    process.env.ALTAIR_DATA_DIR = "/tmp/altair-fresh";
    process.env.NETLY_DATA_DIR = "/tmp/netly-fresh";
    process.env.ELECTRON_USER_DATA = "/tmp/altair-electron";
    assert.equal(getDbPath(), path.join("/tmp/altair-fresh", "altair.db"));
  });

  it("keeps using NETLY_DATA_DIR when ALTAIR_DATA_DIR is unset", () => {
    delete process.env.ALTAIR_DATA_DIR;
    process.env.NETLY_DATA_DIR = "/tmp/netly-fresh";
    process.env.ELECTRON_USER_DATA = "/tmp/altair-electron";
    assert.equal(getDbPath(), path.join("/tmp/netly-fresh", "altair.db"));
  });

  it("keeps the development database in data/ when env dirs are unset", () => {
    delete process.env.ALTAIR_DATA_DIR;
    delete process.env.NETLY_DATA_DIR;
    delete process.env.ELECTRON_USER_DATA;
    assert.equal(path.dirname(getDbPath()), path.join(process.cwd(), "data"));
  });
});

describe("database filename", () => {
  it("opens netly.db when altair.db is not there yet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altair-db-"));
    fs.writeFileSync(path.join(dir, "netly.db"), "");
    assert.equal(resolveDbFile(dir), path.join(dir, "netly.db"));
  });

  it("prefers altair.db once that file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altair-db-"));
    fs.writeFileSync(path.join(dir, "netly.db"), "");
    fs.writeFileSync(path.join(dir, "altair.db"), "");
    assert.equal(resolveDbFile(dir), path.join(dir, "altair.db"));
  });

  it("creates a new database as altair.db", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "altair-db-"));
    assert.equal(resolveDbFile(dir), path.join(dir, "altair.db"));
  });
});
