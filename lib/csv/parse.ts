import Papa, { type ParseResult, type ParseError } from "papaparse";

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
