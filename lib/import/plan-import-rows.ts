export type FingerprintedImportRow = {
  fingerprint: string | null;
  overrideDuplicate?: boolean;
};

export type DuplicateReason = "existing" | "in-file";

export type FlaggedDuplicate = {
  index: number;
  reason: DuplicateReason;
  imported: boolean;
};

export type ImportRowDecision = {
  index: number;
  fingerprint: string | null;
  duplicate: boolean;
  reason: DuplicateReason | null;
  insert: boolean;
};

export type ImportDuplicatesOption = "all" | number[];

// "all", a list of row indexes, or omitted. Indexes are positions in the posted rows.
export const parseImportDuplicates = (value: unknown, rowCount: number): ImportDuplicatesOption | undefined => {
  if (value == null) return undefined;
  if (value === "all") return "all";
  if (!Array.isArray(value)) {
    throw new Error('importDuplicates must be "all" or an array of row indexes');
  }
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= rowCount) {
      throw new Error(`importDuplicates index ${String(item)} is out of range`);
    }
  }
  return value as number[];
};

export const rowConfirmsDuplicate = (
  index: number,
  rowOverride: boolean | undefined,
  option: ImportDuplicatesOption | undefined
): boolean => {
  if (rowOverride === true) return true;
  if (option === "all") return true;
  return Array.isArray(option) && option.includes(index);
};

// Exact-match duplicates are flagged, not inserted, until that row is confirmed.
// Every copy in the file is flagged when the fingerprint repeats or already exists.
export const planImportRows = (
  existingFingerprints: Iterable<string>,
  rows: FingerprintedImportRow[]
): { decisions: ImportRowDecision[]; skippedDuplicates: number; flaggedDuplicates: FlaggedDuplicate[]; skippedIndexes: number[] } => {
  const existing = new Set(existingFingerprints);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.fingerprint) continue;
    counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1);
  }

  const decisions: ImportRowDecision[] = [];
  const flaggedDuplicates: FlaggedDuplicate[] = [];
  const skippedIndexes: number[] = [];
  let skippedDuplicates = 0;

  rows.forEach((row, index) => {
    const fingerprint = row.fingerprint;
    if (!fingerprint) {
      decisions.push({ index, fingerprint: null, duplicate: false, reason: null, insert: true });
      return;
    }

    const inLedger = existing.has(fingerprint);
    const inFile = (counts.get(fingerprint) ?? 0) > 1;
    const duplicate = inLedger || inFile;
    const reason: DuplicateReason | null = !duplicate ? null : inLedger ? "existing" : "in-file";
    const insert = !duplicate || row.overrideDuplicate === true;
    if (duplicate && reason) {
      flaggedDuplicates.push({ index, reason, imported: insert });
      if (!insert) {
        skippedDuplicates += 1;
        skippedIndexes.push(index);
      }
    }
    decisions.push({ index, fingerprint, duplicate, reason, insert });
  });

  return { decisions, skippedDuplicates, flaggedDuplicates, skippedIndexes };
};

export const addStoredFingerprints = (
  target: Set<string>,
  rows: Array<{ fingerprint: string | null; sourceFingerprint: string | null }>
): void => {
  for (const row of rows) {
    if (row.fingerprint) {
      target.add(row.fingerprint);
    }
    if (row.sourceFingerprint) {
      target.add(row.sourceFingerprint);
    }
  }
};
