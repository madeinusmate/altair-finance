"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";

type Import = {
  id: string;
  type: "transactions" | "balances";
  filename: string;
  fileHash: string;
  rowCount: number;
  createdAt: Date | string;
  transactionsCount?: number;
  transfersCount?: number;
  balancesCount?: number;
  investmentsCount?: number;
};

interface DeleteImportDialogProps {
  importRecord: Import;
  onDeleted: () => void;
  trigger?: React.ReactNode;
}

export const DeleteImportDialog = ({ importRecord, onDeleted, trigger }: DeleteImportDialogProps) => {
  const [step, setStep] = useState<"summary" | "confirm">("summary");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [importDetails, setImportDetails] = useState<Import | null>(null);
  const [deletedCounts, setDeletedCounts] = useState<{
    transactions?: number;
    transfers?: number;
    balances?: number;
    investments?: number;
  } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch import details when dialog opens
  useEffect(() => {
    if (isOpen && !importDetails) {
      setIsLoadingDetails(true);
      apiClient
        .get<Import>(`/api/imports/${importRecord.id}`)
        .then((details) => {
          setImportDetails(details);
        })
        .catch((error) => {
          console.error("Error fetching import details:", error);
          // Use the provided importRecord as fallback
          setImportDetails(importRecord);
        })
        .finally(() => {
          setIsLoadingDetails(false);
        });
    }
  }, [isOpen, importRecord, importDetails]);

  const displayImport = importDetails || importRecord;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await apiClient.delete<{
        success: boolean;
        deleted: {
          transactions?: number;
          transfers?: number;
          balances?: number;
          investments?: number;
        };
      }>(`/api/imports/${importRecord.id}`);

      if (result.success) {
        setDeletedCounts(result.deleted);
        setStep("confirm");
        
        // Show success toast
        const totalDeleted = 
          (result.deleted.transactions || 0) +
          (result.deleted.transfers || 0) +
          (result.deleted.balances || 0) +
          (result.deleted.investments || 0);
        
        toast.success(`Successfully deleted import: ${totalDeleted} records removed`);
        
        // Call onDeleted callback after a short delay
        setTimeout(() => {
          onDeleted();
        }, 2000);
      } else {
        throw new Error("Delete operation failed");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete import");
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setStep("summary");
      setDeletedCounts(null);
      setImportDetails(null);
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleString();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        handleClose();
      }
    }}>
      <AlertDialogTrigger asChild onClick={() => setIsOpen(true)}>
        {trigger || <Button variant="destructive" size="sm">Delete</Button>}
      </AlertDialogTrigger>
      <AlertDialogContent>
        {step === "summary" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete Import
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this import and all associated records. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isLoadingDetails ? (
              <div className="py-4 text-center text-muted-foreground">Loading import details...</div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Filename:</span>
                    <span className="text-sm font-medium">{displayImport.filename}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <Badge variant="secondary">{displayImport.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Date:</span>
                    <span className="text-sm">{formatDate(displayImport.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Rows imported:</span>
                    <span className="text-sm font-medium">{displayImport.rowCount}</span>
                  </div>
                </div>
                {displayImport.type === "transactions" && (
                  <div className="rounded-md bg-muted p-3 space-y-1">
                    <div className="text-sm font-medium">Records to be deleted:</div>
                    <div className="text-sm text-muted-foreground">
                      {displayImport.transactionsCount || 0} transactions
                      {displayImport.transfersCount ? `, ${displayImport.transfersCount} transfers` : ""}
                    </div>
                  </div>
                )}
                {displayImport.type === "balances" && (
                  <div className="rounded-md bg-muted p-3 space-y-1">
                    <div className="text-sm font-medium">Records to be deleted:</div>
                    <div className="text-sm text-muted-foreground">
                      {displayImport.balancesCount || 0} balances
                      {displayImport.investmentsCount ? `, ${displayImport.investmentsCount} investments` : ""}
                    </div>
                  </div>
                )}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting || isLoadingDetails}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting || isLoadingDetails}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete Import"
                  )}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-foreground" />
                Import Deleted Successfully
              </AlertDialogTitle>
              <AlertDialogDescription>
                The import and all associated records have been permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deletedCounts && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Deleted records:</div>
                <div className="rounded-md bg-muted p-3 space-y-1">
                  {deletedCounts.transactions !== undefined && (
                    <div className="text-sm text-muted-foreground">
                      {deletedCounts.transactions} transactions
                    </div>
                  )}
                  {deletedCounts.transfers !== undefined && (
                    <div className="text-sm text-muted-foreground">
                      {deletedCounts.transfers} transfers
                    </div>
                  )}
                  {deletedCounts.balances !== undefined && (
                    <div className="text-sm text-muted-foreground">
                      {deletedCounts.balances} balances
                    </div>
                  )}
                  {deletedCounts.investments !== undefined && (
                    <div className="text-sm text-muted-foreground">
                      {deletedCounts.investments} investments
                    </div>
                  )}
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleClose}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};
