import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { electronUsesDevServer, nextServeArgs } from "../electron/dev-server";

describe("electron dev server", () => {
  it("uses next dev only for an unpackaged process flagged by pnpm dev:electron", () => {
    assert.equal(electronUsesDevServer({ ALTAIR_DEV_SERVER: "1" }, false), true);
    assert.equal(electronUsesDevServer({ ALTAIR_DEV_SERVER: "1" }, true), false);
    assert.equal(electronUsesDevServer({}, false), false);
  });

  it("asks Next for turbopack in dev and next start otherwise", () => {
    assert.deepEqual(nextServeArgs("127.0.0.1", 8528, true), [
      "dev",
      "--turbopack",
      "-H",
      "127.0.0.1",
      "-p",
      "8528",
    ]);
    assert.deepEqual(nextServeArgs("127.0.0.1", 8528, false), ["start", "-H", "127.0.0.1", "-p", "8528"]);
  });
});
