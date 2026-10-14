import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUnsafeUploadName } from "../lib/import-upload-path";

describe("import upload names", () => {
  it("accepts a plain zip name", () => {
    assert.equal(isUnsafeUploadName("netly-backup.zip"), false);
  });

  it("rejects traversal and path separators", () => {
    for (const name of ["../etc/passwd", "..", ".", "/etc/passwd", "foo/bar.zip", "foo\\bar.zip", "a\0b.zip", ""]) {
      assert.equal(isUnsafeUploadName(name), true, name);
    }
  });
});
