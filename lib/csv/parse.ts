import Papa, { type ParseResult, type ParseError } from "papaparse";
import { getRequiredHeaders } from "./import-validators";

const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/\s+/g, "_");

export const parseCsvFile = <T extends Record<string, string>>(file: File) =>
  new Promise<{
    data: T[];
    headers: string[];
    errors: string[];
  }>((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => normalizeHeader(header),
      complete: (results: ParseResult<T>) => {
        const errors = results.errors.map((error: ParseError) => error.message);
        resolve({
          data: results.data,
          headers: results.meta.fields || [],
          errors,
        });
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });

export const normalizeCsvHeader = (header: string) => normalizeHeader(header);

/**
 * Generates example CSV placeholder text based on import type
 */
export const getExampleCsvPlaceholder = (importType: "transactions" | "balances" | "accounts"): string => {
  if (importType === "transactions") {
    return "date,account,description,payee,amount,from_amount,to_amount,category,type,transfer_account\n2024-01-15,Checking,Grocery Store,FairPrice,50.00,,,Groceries,debit,\n2024-01-16,Savings,Salary Deposit,Employer,2500.00,,,Income,credit,\n2024-01-17,Checking,Transfer to Savings,,100.00,100.00,100.00,,transfer,Savings";
  } else if (importType === "balances") {
    return "date,account,balance\n2024-01-15,Checking,5000.00\n2024-01-16,Savings,10000.00\n2024-01-17,Investment Account,25000.00";
  } else {
    return "name,type,nature,category,currency,initial_balance\nMy Checking Account,transaction,asset,checking_account,USD,1000.00\nMy Savings Account,balance,asset,savings_account,USD,5000.00\nCredit Card,transaction,liability,credit_card,USD,0.00";
  }
};

/**
 * Counts the number of non-empty rows in CSV content
 */
export const countCsvRows = (content: string): number => {
  if (!content || !content.trim()) {
    return 0;
  }
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.length;
};

/**
 * Detects if the first row of CSV content contains headers
 * by checking if it matches expected header patterns
 */
export const detectCsvHeaders = (
  content: string,
  importType: "transactions" | "balances" | "accounts"
): boolean => {
  if (!content || !content.trim()) {
    return false;
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return false;
  }

  const firstLine = lines[0];
  const requiredHeaders = getRequiredHeaders(importType);
  const normalizedRequiredHeaders = requiredHeaders.map((h) => normalizeHeader(h));

  // Parse first line as CSV to get headers
  const parsed = Papa.parse(firstLine, {
    header: false,
    skipEmptyLines: false,
  });

  if (!parsed.data || parsed.data.length === 0) {
    return false;
  }

  const firstRowHeaders = (parsed.data[0] as string[]).map((h) => normalizeHeader(h));

  // Check if at least 50% of required headers are present in first row
  const matches = normalizedRequiredHeaders.filter((required) =>
    firstRowHeaders.includes(required)
  );

  return matches.length >= normalizedRequiredHeaders.length * 0.5;
};

/**
 * Parses CSV content from a string (paste input)
 * Supports both header + data and data-only formats
 */
export const parseCsvString = <T extends Record<string, string>>(
  content: string,
  importType: "transactions" | "balances" | "accounts"
) =>
  new Promise<{
    data: T[];
    headers: string[];
    errors: string[];
  }>((resolve, reject) => {
    if (!content || !content.trim()) {
      reject(new Error("CSV content is empty"));
      return;
    }

    // Check row limit (5,000 rows)
    const rowCount = countCsvRows(content);
    if (rowCount > 5000) {
      reject(new Error(`CSV contains too many rows (${rowCount}). Maximum allowed is 5,000 rows.`));
      return;
    }

    // Detect if headers are present
    const hasHeaders = detectCsvHeaders(content, importType);

    Papa.parse<T>(content, {
      header: hasHeaders,
      skipEmptyLines: true,
      transformHeader: hasHeaders ? (header: string) => normalizeHeader(header) : undefined,
      complete: (results: ParseResult<T>) => {
        const errors = results.errors.map((error: ParseError) => error.message);

        // If no headers detected and we're in header mode, we need to handle data-only format
        if (!hasHeaders) {
          // For data-only format, we need to manually assign headers
          const requiredHeaders = getRequiredHeaders(importType);
          const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
          
          if (lines.length > 0) {
            // Parse first line to get column count
            const firstLineParsed = Papa.parse(lines[0], {
              header: false,
              skipEmptyLines: false,
            });
            
            if (firstLineParsed.data && firstLineParsed.data.length > 0) {
              const columnCount = (firstLineParsed.data[0] as string[]).length;
              
              // Parse all lines as data rows
              const allLinesParsed = Papa.parse(content, {
                header: false,
                skipEmptyLines: true,
              });
              
              // Convert to object format with required headers
              const data: T[] = (allLinesParsed.data as string[][]).map((row) => {
                const obj: Record<string, string> = {};
                requiredHeaders.forEach((header, index) => {
                  obj[normalizeHeader(header)] = row[index] || "";
                });
                return obj as T;
              });

              resolve({
                data,
                headers: requiredHeaders.map((h) => normalizeHeader(h)),
                errors,
              });
              return;
            }
          }
        }

        resolve({
          data: results.data,
          headers: results.meta.fields || [],
          errors,
        });
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
