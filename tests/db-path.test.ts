import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { getDbPath } from "../lib/db";

describe("database path", () => {
  const previousDataDir = process.env.NETLY_DATA_DIR;
  const previousElectron = process.env.ELECTRON_USER_DATA;

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.NETLY_DATA_DIR;
    else process.env.NETLY_DATA_DIR = previousDataDir;
    if (previousElectron === undefined) delete process.env.ELECTRON_USER_DATA;
    else process.env.ELECTRON_USER_DATA = previousElectron;
  });

  it("uses NETLY_DATA_DIR ahead of the Electron user-data directory", () => {
    process.env.NETLY_DATA_DIR = "/tmp/netly-fresh";
    process.env.ELECTRON_USER_DATA = "/tmp/netly-electron";
    assert.equal(getDbPath(), path.join("/tmp/netly-fresh", "netly.db"));
  });

  it("keeps the development database when NETLY_DATA_DIR is unset", () => {
    delete process.env.NETLY_DATA_DIR;
    delete process.env.ELECTRON_USER_DATA;
    assert.equal(getDbPath(), path.join(process.cwd(), "data", "netly.db"));
  });
});
