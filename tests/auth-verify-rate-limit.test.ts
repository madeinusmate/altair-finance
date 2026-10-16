import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_VERIFY_BASE_DELAY_MS,
  AUTH_VERIFY_MAX_ATTEMPTS,
  AUTH_VERIFY_MAX_DELAY_MS,
  createAuthVerifyLimiter,
} from "../lib/auth-verify-rate-limit";

const failTimes = (limiter: ReturnType<typeof createAuthVerifyLimiter>, count: number, now: number): void => {
  for (let i = 0; i < count; i += 1) {
    const attempt = limiter.begin(now);
    assert.equal(attempt.ok, true);
    if (attempt.ok) attempt.finish(false);
  }
};

describe("auth verify rate limit", () => {
  it("allows attempts until the threshold, then backs off exponentially", () => {
    const limiter = createAuthVerifyLimiter();
    const now = 1_000_000;

    failTimes(limiter, AUTH_VERIFY_MAX_ATTEMPTS - 1, now);
    const lastFree = limiter.begin(now);
    assert.equal(lastFree.ok, true);
    if (lastFree.ok) lastFree.finish(false);

    const blocked = limiter.begin(now);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.retryAfterSeconds, AUTH_VERIFY_BASE_DELAY_MS / 1000);

    const afterFirstDelay = limiter.begin(now + AUTH_VERIFY_BASE_DELAY_MS);
    assert.equal(afterFirstDelay.ok, true);
    if (afterFirstDelay.ok) afterFirstDelay.finish(false);

    const blockedLonger = limiter.begin(now + AUTH_VERIFY_BASE_DELAY_MS);
    assert.equal(blockedLonger.ok, false);
    if (!blockedLonger.ok) assert.equal(blockedLonger.retryAfterSeconds, (AUTH_VERIFY_BASE_DELAY_MS * 2) / 1000);
  });

  it("resets the backoff after a successful verification", () => {
    const limiter = createAuthVerifyLimiter();
    const now = 5_000_000;
    failTimes(limiter, AUTH_VERIFY_MAX_ATTEMPTS, now);

    const afterLock = limiter.begin(now + AUTH_VERIFY_BASE_DELAY_MS);
    assert.equal(afterLock.ok, true);
    if (afterLock.ok) afterLock.finish(true);

    failTimes(limiter, AUTH_VERIFY_MAX_ATTEMPTS - 1, now + AUTH_VERIFY_BASE_DELAY_MS);
    const stillOpen = limiter.begin(now + AUTH_VERIFY_BASE_DELAY_MS);
    assert.equal(stillOpen.ok, true);
  });

  it("caps the backoff", () => {
    const limiter = createAuthVerifyLimiter();
    let now = 0;

    for (let i = 0; i < 25; i += 1) {
      const attempt = limiter.begin(now);
      assert.equal(attempt.ok, true);
      if (attempt.ok) attempt.finish(false);

      const blocked = limiter.begin(now);
      if (blocked.ok) continue;
      if (blocked.retryAfterSeconds * 1000 === AUTH_VERIFY_MAX_DELAY_MS) return;
      now += blocked.retryAfterSeconds * 1000;
    }

    assert.fail("backoff never reached the cap");
  });
});
