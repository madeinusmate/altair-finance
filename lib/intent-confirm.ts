import { spawn } from "child_process";

export const INTENT_CONFIRM_TIMEOUT_MS = 120_000;

export type IntentAction = "delete-books" | "delete-account" | "export-books";

export type IntentPrompt = (action: IntentAction, signal: AbortSignal) => Promise<boolean>;

export type IntentDecision =
  | { ok: true }
  | { ok: false; error: string; status: 403 | 408 };

export const intentDialogScript = (action: IntentAction): string => {
  if (action === "delete-books") {
    return 'display dialog "Delete the books? This cannot be undone." buttons {"Cancel", "Delete the books"} default button "Cancel" cancel button "Cancel" with title "Netly"';
  }
  if (action === "delete-account") {
    return 'display dialog "Delete this account?" buttons {"Cancel", "Delete the account"} default button "Cancel" cancel button "Cancel" with title "Netly"';
  }
  return 'display dialog "Export the books?" buttons {"Cancel", "Export"} default button "Cancel" cancel button "Cancel" with title "Netly"';
};

export const promptWithOsascript: IntentPrompt = (action, signal) => {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-e", intentDialogScript(action)], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onAbort = () => {
      child.kill("SIGTERM");
    };

    if (signal.aborted) {
      onAbort();
      reject(new Error("aborted"));
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) {
        reject(new Error("aborted"));
        return;
      }
      resolve(code === 0);
    });
  });
};

export const confirmIntent = async (
  action: IntentAction,
  options?: { prompt?: IntentPrompt; timeoutMs?: number }
): Promise<IntentDecision> => {
  const prompt = options?.prompt ?? promptWithOsascript;
  const timeoutMs = options?.timeoutMs ?? INTENT_CONFIRM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const accepted = await prompt(action, controller.signal);
    if (!accepted) {
      return { ok: false, error: "Confirmation declined", status: 403 };
    }
    return { ok: true };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: "Confirmation timed out", status: 408 };
    }
    const message = error instanceof Error ? error.message : "Confirmation failed";
    return { ok: false, error: message, status: 403 };
  } finally {
    clearTimeout(timer);
  }
};
