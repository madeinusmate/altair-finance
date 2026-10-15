import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("packaged altair launcher", () => {
  it("follows the /usr/local/bin symlink to the bundled node and script", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "altair-launcher-"));
    const resources = path.join(root, "Resources");
    const bin = path.join(root, "bin");
    const nodeDir = path.join(resources, "node", "arm64");
    fs.mkdirSync(nodeDir, { recursive: true });
    fs.mkdirSync(bin);
    fs.copyFileSync(path.join(process.cwd(), "cli", "altair-packaged"), path.join(resources, "altair"));
    fs.chmodSync(path.join(resources, "altair"), 0o755);
    fs.writeFileSync(path.join(resources, "altair.mjs"), "process.stdout.write('books')\n");
    fs.writeFileSync(
      path.join(nodeDir, "node"),
      "#!/bin/sh\nprintf '%s\\n' \"$1\"\n",
    );
    fs.chmodSync(path.join(nodeDir, "node"), 0o755);
    fs.symlinkSync(path.join(resources, "altair"), path.join(bin, "altair"));

    const linked = await execFileAsync(path.join(bin, "altair"), [], { cwd: root });
    assert.equal(linked.stdout, `${path.join(resources, "altair.mjs")}\n`);

    const fromPath = await execFileAsync("altair", [], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
    assert.equal(fromPath.stdout, `${path.join(resources, "altair.mjs")}\n`);
  });
});
