import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedLoopbackOrigin, buildOAuthRedirect } from "../oauth-relay/api/redirect-allowlist";

const encodeTarget = (value: string): string => Buffer.from(value).toString("base64");

const stateFor = (target: string): string => `app_state_${encodeTarget(target)}`;

const empty = {
  code: null,
  error: null,
  errorDescription: null,
  state: null,
};

describe("oauth redirect allowlist", () => {
  it("redirects to the local connect path when state has no target", () => {
    const result = buildOAuthRedirect({ ...empty, code: "bank-code", state: "app_stateparameter" });
    assert.equal(result.ok, true);
    if (result.ok) {
      const url = new URL(result.location);
      assert.equal(url.origin, "http://127.0.0.1:8528");
      assert.equal(url.pathname, "/accounts/connect");
      assert.equal(url.searchParams.get("code"), "bank-code");
    }
  });

  it("accepts localhost and 127.0.0.1 on the app ports", () => {
    for (const target of [
      "http://localhost:8528",
      "http://127.0.0.1:8528/",
      "http://localhost:8527/accounts/connect",
      "http://127.0.0.1:8527",
      "http://127.0.0.1:8530",
      "http://localhost:8535/accounts/connect",
    ]) {
      const result = buildOAuthRedirect({ ...empty, code: "ok", state: stateFor(target) });
      assert.equal(result.ok, true, target);
      if (result.ok) {
        const url = new URL(result.location);
        assert.equal(url.pathname, "/accounts/connect");
        assert.equal(url.protocol, "http:");
        assert.ok(url.hostname === "localhost" || url.hostname === "127.0.0.1");
        const port = Number(url.port);
        assert.ok(port === 8527 || (port >= 8528 && port <= 8535));
      }
    }
  });

  it("rejects remote hosts, other ports, and non-http schemes", () => {
    const code = "super-secret-auth-code";
    const rejected = [
      "https://evil.example/steal",
      "http://evil.example",
      "http://localhost.evil.example:8528",
      "http://127.0.0.1.evil.example:8528",
      "http://localhost:1337",
      "http://127.0.0.1:8536",
      "http://127.0.0.1:65535",
      "http://127.0.0.1:80",
      "http://127.0.0.1",
      "https://localhost:8528",
      "http://user:pass@127.0.0.1:8528",
      "http://127.0.0.1:8528@evil.example",
      "http://evil.example@127.0.0.1:8528",
      "javascript:alert(1)",
      "//evil.example",
      "http://0.0.0.0:8528",
      "http://[::1]:8528",
      "http://127.0.0.1:8528/steal",
      "http://localhost:8528/accounts/connect/extra",
    ];

    for (const target of rejected) {
      const result = buildOAuthRedirect({ ...empty, code, state: stateFor(target) });
      assert.equal(result.ok, false, target);
      assert.equal("location" in result, false);
      assert.equal(JSON.stringify(result).includes(code), false);
      assert.equal(allowedLoopbackOrigin(target), null);
    }
  });

  it("does not follow a target hidden in the query or hash", () => {
    const result = buildOAuthRedirect({
      ...empty,
      code: "ok",
      state: stateFor("http://127.0.0.1:8528/?next=https://evil.example"),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      const url = new URL(result.location);
      assert.equal(url.origin, "http://127.0.0.1:8528");
      assert.equal(url.pathname, "/accounts/connect");
      assert.equal(url.searchParams.get("next"), null);
      assert.equal(url.searchParams.get("code"), "ok");
    }
  });

  it("rejects a state target that is not valid base64", () => {
    const result = buildOAuthRedirect({ ...empty, code: "secret", state: "app_state_%%%" });
    assert.equal(result.ok, false);
  });
});
