export const AUTH_VERIFY_MAX_ATTEMPTS = 5;
export const AUTH_VERIFY_BASE_DELAY_MS = 1000;
export const AUTH_VERIFY_MAX_DELAY_MS = 15 * 60 * 1000;

type AttemptBucket = {
  failures: number;
  lockedUntil: number;
};

export type AuthVerifyGate =
  | {
      ok: true;
      finish: (success: boolean) => void;
    }
  | {
      ok: false;
      retryAfterSeconds: number;
    };

const delayForFailureCount = (failures: number): number => {
  const stepsOver = Math.max(0, failures - AUTH_VERIFY_MAX_ATTEMPTS);
  const cappedSteps = Math.min(stepsOver, 20);
  return Math.min(AUTH_VERIFY_BASE_DELAY_MS * 2 ** cappedSteps, AUTH_VERIFY_MAX_DELAY_MS);
};

export const createAuthVerifyLimiter = () => {
  const bucket: AttemptBucket = { failures: 0, lockedUntil: 0 };

  const begin = (now = Date.now()): AuthVerifyGate => {
    if (bucket.lockedUntil > now) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
      };
    }

    let settled = false;
    return {
      ok: true,
      finish: (success: boolean) => {
        if (settled) return;
        settled = true;
        if (success) {
          bucket.failures = 0;
          bucket.lockedUntil = 0;
          return;
        }
        bucket.failures += 1;
        if (bucket.failures >= AUTH_VERIFY_MAX_ATTEMPTS) {
          bucket.lockedUntil = now + delayForFailureCount(bucket.failures);
        }
      },
    };
  };

  const reset = (): void => {
    bucket.failures = 0;
    bucket.lockedUntil = 0;
  };

  return { begin, reset };
};

const authVerifyLimiter = createAuthVerifyLimiter();

export const beginAuthVerifyAttempt = (now?: number): AuthVerifyGate => authVerifyLimiter.begin(now);

export const resetAuthVerifyRateLimit = (): void => {
  authVerifyLimiter.reset();
};
