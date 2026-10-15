"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";

interface BulkRecategorizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionCount: number;
  transferCount: number;
  destinationName: string;
  onConfirm: () => Promise<void>;
}

export const BulkRecategorizeDialog = ({
  open,
  onOpenChange,
  transactionCount,
  transferCount,
  destinationName,
  onConfirm,
}: BulkRecategorizeDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recategorize");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isLoading) {
          setError(null);
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recategorize</DialogTitle>
          <DialogDescription>
            Move {transactionCount} {transactionCount === 1 ? "transaction" : "transactions"} and{" "}
            {transferCount} {transferCount === 1 ? "transfer" : "transfers"} to {destinationName}.
            Spent amounts will follow the new category.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
