"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";

type Step = "explain" | "confirm" | "install-error" | "working";
type AgentStatus = { enabled: boolean; stopped: boolean; running: boolean };

export const AgentGrantCard = () => {
  const [step, setStep] = useState<Step>("explain");
  const [installError, setInstallError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus(await apiClient.get<AgentStatus>("/api/agent/status"));
      } catch {
        setStatus(null);
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
      setInstallError(installed.error ?? "Could not install the netly command");
      setStep("install-error");
      return;
    }

    if (!window.electron?.activateOwner) {
      setStep("confirm");
      toast.error("Open the Netly app to start the books owner");
      return;
    }

    await window.electron.activateOwner();
  };

  const activate = async () => {
    setStep("working");
    try {
      await window.electron?.activateOwner?.();
    } catch (error) {
      setStep("install-error");
      toast.error(error instanceof Error ? error.message : "Could not start the books owner");
    }
  };

  if (status?.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        The agent grant is {status.running ? "running" : "stopped"}. Stop, enable, and revoke are in the sidebar.
        The <span className="font-medium text-foreground">netly</span> command uses it while you are logged in.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {step === "explain" && (
        <>
          <p className="text-sm text-muted-foreground">
            An agent grant lets the <span className="font-medium text-foreground">netly</span> command
            read and change your books while you are logged in, even when this window is closed.
            Any program you run can use that command. Deleting the books, deleting an account, and
            exporting the books wait for you to answer a dialog on this Mac.
          </p>
          <Button onClick={() => setStep("confirm")}>Continue</Button>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="text-sm text-muted-foreground">
            Netly will keep your passphrase in the macOS keychain for the books owner. The command
            never receives it. The books stay open for this login session.
          </p>
          <div className="flex gap-2">
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
          <div className="flex gap-2">
            <Button onClick={() => void createGrant()}>Try install again</Button>
            <Button variant="outline" onClick={() => void activate()}>Continue without the command</Button>
          </div>
        </>
      )}
    </div>
  );
};
