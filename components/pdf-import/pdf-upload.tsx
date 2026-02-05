"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X } from "lucide-react";
import { Account } from "@/lib/db/schema";
import { validatePdfFile } from "@/lib/pdf/openai-client";

interface PdfUploadProps {
  accounts: Account[];
  selectedAccountId?: string;
  fileName?: string;
  disabled?: boolean;
  onAccountChange: (accountId: string) => void;
  onFileSelected: (file: File) => void;
  onClear?: () => void;
}

export const PdfUpload = ({
  accounts,
  selectedAccountId,
  fileName,
  disabled,
  onAccountChange,
  onFileSelected,
  onClear,
}: PdfUploadProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const transactionAccounts = accounts.filter((account) => account.type === "transaction");

  const handleChooseFile = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileError(null);
      
      // Validate file
      const validation = validatePdfFile(file);
      if (!validation.valid) {
        setFileError(validation.error || "Invalid file");
        return;
      }

      onFileSelected(file);
    }
    event.target.value = "";
  };

  const handleClear = () => {
    setFileError(null);
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Account</label>
        <Select
          value={selectedAccountId || ""}
          onValueChange={onAccountChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {transactionAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select the account to import transactions into
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">PDF Statement</label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled || !selectedAccountId}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleChooseFile}
            disabled={disabled || !selectedAccountId}
          >
            <Upload />
            Choose PDF
          </Button>
          {fileName && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{fileName}</span>
              {onClear && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        {fileError && (
          <p className="text-xs text-destructive">{fileError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Upload a PDF bank or credit card statement (max 50MB)
        </p>
      </div>
    </div>
  );
};
