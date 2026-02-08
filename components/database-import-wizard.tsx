"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Upload,
  KeyRound,
  FileText,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface DatabaseImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ValidationError {
  category: "format" | "key" | "data" | "schema";
  technical: string;
  userFriendly: string;
}

interface DatabaseStats {
  schemaVersion: number;
  createdAt: number;
  accountCount: number;
  accountNames: string[];
  transactionCounts: Record<string, number>;
}

export const DatabaseImportWizard = ({ open, onOpenChange }: DatabaseImportWizardProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { refreshStatus } = useAuth();

  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setKey("");
    setConfirmText("");
    setValidationErrors([]);
    setDatabaseStats(null);
    setProgressMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = (open: boolean) => {
    if (!open && !isImporting) {
      resetWizard();
    }
    onOpenChange(open);
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    // Validate file type
    if (!selectedFile.name.endsWith(".zip") && selectedFile.type !== "application/zip") {
      setValidationErrors([
        {
          category: "format",
          technical: `File type: ${selectedFile.type}, expected ZIP archive`,
          userFriendly: "Please select a valid ZIP backup file exported from Netly.",
        },
      ]);
      return;
    }

    // Warn about large files
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    if (fileSizeMB > 100) {
      toast.warning(`Large file detected: ${fileSizeMB.toFixed(2)}MB. Import may take longer.`);
    }

    setFile(selectedFile);
    setValidationErrors([]);

    // Validate ZIP structure immediately by trying to read it
    setIsValidating(true);
    setProgressMessage("Validating ZIP file structure...");

    try {
      // Try to read the ZIP file to validate its structure
      // We'll use a simple approach: try to extract and validate structure
      // For now, we'll proceed to key entry and validate there
      // The actual ZIP validation happens server-side when we have the key
      setStep(2);
    } catch (error) {
      setValidationErrors([
        {
          category: "format",
          technical: error instanceof Error ? error.message : String(error),
          userFriendly: "Failed to validate the file. Please ensure it's a valid Netly backup.",
        },
      ]);
    } finally {
      setIsValidating(false);
      setProgressMessage("");
    }
  };

  const handleKeySubmit = async () => {
    if (!file || key.length < 8) {
      return;
    }

    setIsValidating(true);
    setProgressMessage("Validating encryption key...");
    setValidationErrors([]);

    try {
      // Validate key and get database stats (validate-only mode)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("key", key);
      formData.append("validateOnly", "true");

      const response = await fetch("/api/app/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errorCode === "RATE_LIMIT_EXCEEDED") {
          setValidationErrors(
            data.details || [
              {
                category: "key",
                technical: "Rate limit exceeded",
                userFriendly: "Too many attempts. Please wait a minute before trying again.",
              },
            ]
          );
        } else if (data.errorCode === "WRONG_ENCRYPTION_KEY") {
          setValidationErrors(
            data.details || [
              {
                category: "key",
                technical: "Decryption failed",
                userFriendly: "The encryption key is incorrect. Please check and try again.",
              },
            ]
          );
        } else {
          setValidationErrors(
            data.details || [
              {
                category: "key",
                technical: data.error || "Unknown error",
                userFriendly: data.error || "Validation failed. Please check your encryption key.",
              },
            ]
          );
        }
        return;
      }

      // Success - get stats from response if available
      if (data.stats) {
        setDatabaseStats(data.stats);
      }

      // Proceed to review step
      setStep(3);
    } catch (error) {
      setValidationErrors([
        {
          category: "key",
          technical: error instanceof Error ? error.message : String(error),
          userFriendly: "Failed to validate the encryption key. Please try again.",
        },
      ]);
    } finally {
      setIsValidating(false);
      setProgressMessage("");
    }
  };

  const handleImport = async () => {
    if (!file || !key || confirmText !== "IMPORT") {
      return;
    }

    setIsImporting(true);
    setProgressMessage("Backing up existing database...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("key", key);

      // Update progress messages during import
      const progressSteps = [
        "Backing up existing database...",
        "Extracting files...",
        "Validating database...",
        "Importing database...",
        "Done",
      ];

      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < progressSteps.length - 1) {
          stepIndex++;
          setProgressMessage(progressSteps[stepIndex]);
        }
      }, 1000);

      const response = await fetch("/api/app/import", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      setProgressMessage("Done");
      toast.success("Database imported successfully!");

      // Refresh auth status and redirect
      await refreshStatus();
      setTimeout(() => {
        router.push("/dashboard");
        handleClose(false);
      }, 1000);
    } catch (error) {
      setProgressMessage("");
      toast.error(error instanceof Error ? error.message : "Import failed");
      setIsImporting(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatErrors = (errors: ValidationError[]): { format: string[]; key: string[]; data: string[]; schema: string[] } => {
    const categorized = {
      format: [] as string[],
      key: [] as string[],
      data: [] as string[],
      schema: [] as string[],
    };

    errors.forEach((error) => {
      categorized[error.category].push(error.userFriendly);
    });

    return categorized;
  };

  const errors = formatErrors(validationErrors);
  const hasErrors = validationErrors.length > 0;
  const isConfirmValid = confirmText === "IMPORT";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" showCloseButton={!isImporting}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Database
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Select a database backup file to import."}
            {step === 2 && "Enter the encryption key for the database."}
            {step === 3 && "Review the database information and confirm the import."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: File Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="import-file">Database Backup File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={fileInputRef}
                    id="import-file"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={handleFileSelect}
                    disabled={isValidating}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isValidating}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose ZIP File
                  </Button>
                  {file && (
                    <span className="text-sm text-muted-foreground">
                      Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select a ZIP file exported from Netly containing your database backup.
                </p>
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progressMessage || "Validating..."}
                </div>
              )}

              {hasErrors && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-1">
                    {errors.format.map((error, index) => (
                      <p key={`format-${index}`}>{error}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 2: Key Entry */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="import-key">Encryption Key</Label>
                <Input
                  id="import-key"
                  name="import-key"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter the encryption key for the database…"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={isValidating || isImporting}
                  spellCheck={false}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 8 characters. This is the key used to encrypt the database you&apos;re importing.
                </p>
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progressMessage || "Validating encryption key..."}
                </div>
              )}

              {hasErrors && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="space-y-1">
                    {errors.key.map((error, index) => (
                      <p key={`key-${index}`}>{error}</p>
                    ))}
                    {errors.schema.map((error, index) => (
                      <p key={`schema-${index}`}>{error}</p>
                    ))}
                    {errors.data.map((error, index) => (
                      <p key={`data-${index}`}>{error}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {file && (
                <div className="rounded-md border p-3 bg-muted/50">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-muted-foreground">
                      ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Review & Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              {databaseStats && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Database Information</CardTitle>
                    <CardDescription>Preview of the database you&apos;re importing</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Schema Version:</span>
                        <span className="ml-2 font-medium">{databaseStats.schemaVersion}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <span className="ml-2 font-medium">{formatDate(databaseStats.createdAt)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Accounts:</span>
                        <span className="ml-2 font-medium">{databaseStats.accountCount}</span>
                      </div>
                    </div>
                    {databaseStats.accountNames.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Account Names:</p>
                        <div className="flex flex-wrap gap-2">
                          {databaseStats.accountNames.map((name, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This will replace your current database with the imported one. Make sure you have a backup if needed.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="import-confirm">Type IMPORT to confirm</Label>
                <Input
                  id="import-confirm"
                  name="import-confirm"
                  autoComplete="off"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type IMPORT…"
                  spellCheck={false}
                  disabled={isImporting}
                />
              </div>

              {isImporting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progressMessage || "Importing..."}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 && (
            <Button onClick={() => handleClose(false)} variant="outline" disabled={isValidating}>
              Cancel
            </Button>
          )}
          {step === 2 && (
            <>
              <Button
                onClick={() => {
                  setStep(1);
                  setValidationErrors([]);
                }}
                variant="outline"
                disabled={isValidating}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleKeySubmit}
                disabled={!file || key.length < 8 || isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating…
                  </>
                ) : (
                  "Next"
                )}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button
                onClick={() => {
                  setStep(2);
                  setConfirmText("");
                }}
                variant="outline"
                disabled={isImporting}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={!isConfirmValid || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm Import
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
