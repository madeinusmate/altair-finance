import Papa from "papaparse";

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
      transformHeader: (header) => normalizeHeader(header),
      complete: (results) => {
        const errors = results.errors.map((error) => error.message);
        resolve({
          data: results.data,
          headers: results.meta.fields || [],
          errors,
        });
      },
      error: (error) => {
        reject(error);
      },
    });
  });

export const normalizeCsvHeader = (header: string) => normalizeHeader(header);
