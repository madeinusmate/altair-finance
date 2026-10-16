"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";

export const DatabaseDeleteDialog = () => {
  const [confirmText, setConfirmText] = useState("");
  const [key, setKey] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { lock, refreshStatus } = useAuth();
  const router = useRouter();

  const isConfirmValid = confirmText === "DELETE";
  const isKeyValid = key.length >= 8;

  const handleDelete = async () => {
    if (!isConfirmValid || !isKeyValid) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/app/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Database deletion failed");
      }

      lock();
      await refreshStatus();
      router.push("/onboarding");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Database deletion failed");
    } finally {
      setIsDeleting(false);
      setConfirmText("");
      setKey("");
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete Database</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Database
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes your local database and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
            <Input
              id="delete-confirmation"
              name="delete-confirmation"
              autoComplete="off"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="Type DELETE…"
              spellCheck={false}
              disabled={isDeleting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-key">Re-enter Encryption Key</Label>
            <Input
              id="delete-key"
              name="delete-key"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Enter your encryption key…"
              spellCheck={false}
              disabled={isDeleting}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!isConfirmValid || !isKeyValid || isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete Database"
              )}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
