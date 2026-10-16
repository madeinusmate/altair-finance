export interface ParsedTransaction {
  date: string; // YYYY-MM-DD, or the raw text when the date is ambiguous
  description: string;
  amount: number; // Always positive
  category: string;
  type: "debit" | "credit";
  warnings?: string[];
}

export interface ParseResult {
  success: true;
  transactions: ParsedTransaction[];
  metadata: {
    filename: string;
    fileSize: number;
    extractedCount: number;
    parser: "local";
  };
}

export interface ParseError {
  success: false;
  error: string;
  retryable: boolean;
}

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const validatePdfFile = (file: File): { valid: boolean; error?: string } => {
  if (file.type !== "application/pdf") {
    return { valid: false, error: "File must be a PDF" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`,
    };
  }

  return { valid: true };
};
