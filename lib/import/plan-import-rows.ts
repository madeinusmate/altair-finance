export type FingerprintedImportRow = {
  fingerprint: string | null;
  overrideDuplicate?: boolean;
};

export type ImportRowDecision = {
  index: number;
  fingerprint: string | null;
  duplicate: boolean;
  insert: boolean;
};

// Identity is the full-field fingerprint (exact date, exact other imported fields).
// First copy in the batch is insertable. A later identical copy is skipped unless
// that row sets overrideDuplicate. An override is recorded so a further copy is still skipped.
export const planImportRows = (
  existingFingerprints: Iterable<string>,
  rows: FingerprintedImportRow[]
): { decisions: ImportRowDecision[]; skippedDuplicates: number } => {
  const seen = new Set(existingFingerprints);
  const decisions: ImportRowDecision[] = [];
  let skippedDuplicates = 0;

  rows.forEach((row, index) => {
    const fingerprint = row.fingerprint;
    if (!fingerprint) {
      decisions.push({ index, fingerprint: null, duplicate: false, insert: true });
      return;
    }

    const duplicate = seen.has(fingerprint);
    if (duplicate && row.overrideDuplicate !== true) {
      skippedDuplicates += 1;
      decisions.push({ index, fingerprint, duplicate: true, insert: false });
      return;
    }

    seen.add(fingerprint);
    decisions.push({ index, fingerprint, duplicate, insert: true });
  });

  return { decisions, skippedDuplicates };
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
