import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmIntent, intentDialogScript } from "../lib/intent-confirm";

describe("intent confirm", () => {
  it("asks with a dialog and has no skip flag", () => {
    for (const action of ["delete-books", "delete-account", "export-books"] as const) {
      const script = intentDialogScript(action);
      assert.match(script, /display dialog/);
      assert.equal(script.includes("--yes"), false);
    }
  });

  it("returns declined when the person cancels", async () => {
    const decision = await confirmIntent("delete-books", {
      prompt: async () => false,
    });
    assert.deepEqual(decision, { ok: false, error: "Confirmation declined", status: 403 });
  });

  it("times out when the dialog is never answered", async () => {
    const decision = await confirmIntent("export-books", {
      timeoutMs: 20,
      prompt: (_action, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.status, 408);
  });
});
