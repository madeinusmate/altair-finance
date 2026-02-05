import OpenAI from "openai";

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD format
  description: string;
  amount: number; // Always positive
  category: string;
  type: "debit" | "credit";
}

export interface ParseResult {
  success: true;
  transactions: ParsedTransaction[];
  metadata: {
    filename: string;
    fileSize: number;
    extractedCount: number;
  };
}

export interface ParseError {
  success: false;
  error: string;
  retryable: boolean;
}

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Parse PDF statement using OpenAI API
 */
export const parsePdfStatement = async (
  pdfBase64: string,
  filename: string,
  validCategories: string[]
): Promise<ParseResult | ParseError> => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    return {
      success: false,
      error: "OpenAI API key not configured",
      retryable: false,
    };
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  const maxRetries = 3;
  let lastError: Error | null = null;

  // Build the prompt with valid categories
  const categoriesList = validCategories.join(", ");
  
  const systemPrompt = `You are a financial transaction extraction assistant. Extract transactions from bank/credit card statements into structured JSON format.`;

  const userPrompt = `Extract all transactions from this PDF bank/credit card statement. Return ONLY a valid JSON object matching this exact schema:

{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": number (always positive),
      "category": "string (must match one of: ${categoriesList})",
      "type": "debit" | "credit"
    }
  ]
}

Rules:
- Date format: YYYY-MM-DD only (e.g., 2024-01-15)
- Amount: Always positive number (credits are marked by type="credit", not negative amounts)
- Credit transactions: Use type="credit" (not negative amounts). Credit transactions are often shown in brackets or marked as credits on statements.
- Category: Must exactly match one of these categories: ${categoriesList}
- Description: Use the best available description from the statement
- Ignore all non-transaction information (headers, footers, balances, etc.)
- ONLY extract transactions. Do not include any other information.

Return ONLY the JSON object, no markdown, no code blocks, no explanations.`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await openai.responses.create({
        model: "gpt-5-nano",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: userPrompt,
              },
              {
                type: "input_file",
                filename: filename,
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            ],
          },
        ],
      });

      const content = response.output_text;
      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      // Parse JSON response
      let parsed: { transactions: ParsedTransaction[] };
      try {
        // Remove markdown code blocks if present
        const cleanedContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
        parsed = JSON.parse(cleanedContent);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
        throw new Error("Response missing transactions array");
      }

      if (parsed.transactions.length === 0) {
        return {
          success: false,
          error: "No transactions found in PDF",
          retryable: false,
        };
      }

      // Validate transactions
      const validatedTransactions: ParsedTransaction[] = [];
      for (const tx of parsed.transactions) {
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
          console.warn(`Invalid date format: ${tx.date}`);
          continue;
        }

        // Validate amount
        if (typeof tx.amount !== "number" || tx.amount <= 0) {
          console.warn(`Invalid amount: ${tx.amount}`);
          continue;
        }

        // Validate type
        if (tx.type !== "debit" && tx.type !== "credit") {
          console.warn(`Invalid type: ${tx.type}`);
          continue;
        }

        // Validate category
        if (!validCategories.includes(tx.category)) {
          console.warn(`Invalid category: ${tx.category}`);
          continue;
        }

        validatedTransactions.push({
          date: tx.date,
          description: tx.description || "",
          amount: tx.amount,
          category: tx.category,
          type: tx.type,
        });
      }

      if (validatedTransactions.length === 0) {
        return {
          success: false,
          error: "No valid transactions found after validation",
          retryable: true,
        };
      }

      // Add delay after successful API call
      await sleep(0);

      return {
        success: true,
        transactions: validatedTransactions,
        metadata: {
          filename,
          fileSize: (pdfBase64.length * 3) / 4,
          extractedCount: validatedTransactions.length,
        },
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit
      let isRateLimit = false;
      if (error && typeof error === "object") {
        const errorObj = error as Record<string, unknown>;
        if ("status" in errorObj && errorObj.status === 429) {
          isRateLimit = true;
        }
        if ("code" in errorObj && (errorObj.code === "rate_limit_exceeded" || errorObj.code === "429")) {
          isRateLimit = true;
        }
      }

      if (isRateLimit && attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await sleep(backoffMs);
        continue;
      }

      // For non-rate-limit errors or last attempt, return error
      return {
        success: false,
        error: lastError.message || "Failed to parse PDF",
        retryable: attempt < maxRetries - 1,
      };
    }
  }

  return {
    success: false,
    error: lastError?.message || "Max retries exceeded",
    retryable: false,
  };
};

/**
 * Validate file size
 */
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
