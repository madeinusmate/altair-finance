import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeLocalApiRequest, providedLocalApiToken, tokensMatch } from "../lib/local-api-guard";
import { shouldAttachApiToken } from "../lib/install-api-token";

const TOKEN = "a".repeat(64);

describe("local API token", () => {
  it("allows requests when the server is not managed by Electron", () => {
    const decision = authorizeLocalApiRequest(null, {});
    assert.deepEqual(decision, { ok: true });
  });

  it("rejects a missing token when Electron started the server", () => {
    const decision = authorizeLocalApiRequest(null, {
      ELECTRON_USER_DATA: "/tmp/altair",
      ALTAIR_API_TOKEN: TOKEN,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.status, 401);
  });

  it("fails closed when Electron is present but no token was configured", () => {
    const decision = authorizeLocalApiRequest("anything", {
      ELECTRON_USER_DATA: "/tmp/altair",
    });
    assert.equal(decision.ok, false);
  });

  it("rejects a wrong token and a prefix of the real token", () => {
    const env = { ALTAIR_API_TOKEN: TOKEN };
    assert.equal(authorizeLocalApiRequest("b".repeat(64), env).ok, false);
    assert.equal(authorizeLocalApiRequest(TOKEN.slice(0, 32), env).ok, false);
    assert.equal(tokensMatch(TOKEN + "x", TOKEN), false);
  });

  it("accepts the exact per-launch token", () => {
    const decision = authorizeLocalApiRequest(TOKEN, { ALTAIR_API_TOKEN: TOKEN });
    assert.deepEqual(decision, { ok: true });
  });

  it("accepts a token that is still in NETLY_API_TOKEN", () => {
    const decision = authorizeLocalApiRequest(TOKEN, { NETLY_API_TOKEN: TOKEN });
    assert.deepEqual(decision, { ok: true });
  });

  it("accepts the previous request header", () => {
    const headers = {
      get: (name: string) => (name === "x-netly-token" ? TOKEN : null),
    };
    assert.equal(providedLocalApiToken(headers), TOKEN);
  });
});

describe("renderer token attachment", () => {
  const origin = "http://127.0.0.1:8528";

  it("attaches the token to same-origin API requests", () => {
    assert.equal(shouldAttachApiToken("/api/auth/verify", origin), true);
    assert.equal(shouldAttachApiToken("/api", origin), true);
    assert.equal(shouldAttachApiToken("http://127.0.0.1:8528/api/accounts", origin), true);
    assert.equal(shouldAttachApiToken("http://localhost:8528/api/accounts", origin), true);
  });

  it("does not attach the token to pages or third-party URLs", () => {
    assert.equal(shouldAttachApiToken("/accounts", origin), false);
    assert.equal(shouldAttachApiToken("https://evil.example/api/auth/verify", origin), false);
    assert.equal(shouldAttachApiToken("//evil.example/api/auth/verify", origin), false);
    assert.equal(shouldAttachApiToken("https://example.com/api/auth/verify", origin), false);
  });
});
