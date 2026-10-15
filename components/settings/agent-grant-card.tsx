"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Step = "explain" | "confirm" | "install-error" | "working";
type AgentStatus = { enabled: boolean; stopped: boolean; running: boolean };

const AGENT_PROMPT = `Altair is installed on this Mac. Find the altair command with \`command -v altair\`. It should be /usr/local/bin/altair. Run \`altair help\` and read stderr for the command list. Then run \`altair status\` and read the JSON on stdout. Do not look for an API token or a passphrase. If status says the agent grant is not set up or is stopped, stop and tell me.`;

export const AgentGrantCard = () => {
  const [step, setStep] = useState<Step>("explain");
  const [installError, setInstallError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus(await apiClient.get<AgentStatus>("/api/agent/status"));
      } catch {
        setStatus(null);
      } finally {
        setReady(true);
      }
    };
    void load();
  }, []);

  const createGrant = async () => {
    setStep("working");
    try {
      await apiClient.post<{ ok: boolean }>("/api/agent/grant", {});
    } catch (error) {
      setStep("confirm");
      toast.error(error instanceof Error ? error.message : "Could not create the agent grant");
      return;
    }

    const installed = window.electron?.installCommand
      ? await window.electron.installCommand()
      : { ok: true };
    if (!installed.ok) {
      setInstallError(installed.error ?? "Could not install the altair command");
      setStep("install-error");
      return;
    }

    if (!window.electron?.activateOwner) {
      setStep("confirm");
      toast.error("Open the Altair app to start the books owner");
      return;
    }

    try {
      await window.electron.activateOwner();
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : "Could not start the books owner");
      setStep("install-error");
      return;
    }
    setStatus({ enabled: true, stopped: false, running: true });
    setStep("explain");
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    toast.success("Copied the prompt");
  };

  const stopAgent = async () => {
    try {
      await apiClient.post("/api/agent/stop", {});
      await window.electron?.stopOwner?.();
      setStatus({ enabled: true, stopped: true, running: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop the agent");
    }
  };

  const enableAgent = async () => {
    try {
      await apiClient.post("/api/agent/enable", {});
      await window.electron?.activateOwner?.();
      setStatus({ enabled: true, stopped: false, running: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable the agent");
    }
  };

  const revokeAgent = async () => {
    try {
      await apiClient.delete("/api/agent/grant");
      await window.electron?.revokeOwner?.();
      setStatus({ enabled: false, stopped: false, running: false });
      setStep("explain");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the agent grant");
    }
  };

  const activate = async () => {
    setStep("working");
    try {
      await window.electron?.activateOwner?.();
      setStatus({ enabled: true, stopped: false, running: true });
      setStep("explain");
    } catch (error) {
      setStep("install-error");
      toast.error(error instanceof Error ? error.message : "Could not start the books owner");
    }
  };

  if (status?.enabled && step !== "working" && step !== "install-error") {
    const connected = status.running;
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              connected ? "bg-connected" : "bg-disconnected",
            )}
          />
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <Button variant="outline" onClick={() => void stopAgent()}>Stop</Button>
          ) : (
            <Button onClick={() => void enableAgent()}>Enable</Button>
          )}
          <Button variant="outline" onClick={() => void revokeAgent()}>Revoke</Button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Paste this to an agent on this Mac. It finds <span className="font-medium text-foreground">altair</span> and
            reads status before it touches your books.
          </p>
          <pre className="whitespace-pre-wrap rounded-2xl border border-border bg-muted/40 p-3 text-xs leading-relaxed">
            {AGENT_PROMPT}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyPrompt()}>
              Copy prompt
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <Skeleton className="h-24 w-full rounded-2xl" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "explain" && (
        <>
          <p className="text-sm text-muted-foreground">
            An agent grant lets the <span className="font-medium text-foreground">altair</span> command
            read and change your books while you are logged in, even when this window is closed.
            Any program you run can use that command. Deleting the books, deleting an account, and
            exporting the books wait for you to answer a dialog on this Mac.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep("confirm")}>Continue</Button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="text-sm text-muted-foreground">
            Altair will keep your passphrase in the macOS keychain for the books owner. The command
            never receives it. The books stay open for this login session.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void createGrant()}>Create agent grant</Button>
            <Button variant="outline" onClick={() => setStep("explain")}>Back</Button>
          </div>
        </>
      )}

      {step === "working" && (
        <p className="text-sm text-muted-foreground">Setting up the agent grant…</p>
      )}

      {step === "install-error" && (
        <>
          <p className="text-sm text-destructive">{installError}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void createGrant()}>Try install again</Button>
            <Button variant="outline" onClick={() => void activate()}>Continue without the command</Button>
          </div>
        </>
      )}
    </div>
  );
};
