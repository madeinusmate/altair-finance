export const DUPLICATE_WARNING = "Exact duplicate";

export type DuplicateReviewFields = {
  fingerprint: string | null;
  duplicate?: boolean;
  excluded?: boolean;
  overrideDuplicate?: boolean;
  warnings: string[];
  errors: string[];
};

// Flags every exact duplicate: a row already in the ledger, and every copy when
// the same fingerprint appears more than once in this file. Held out until included.
export const applyReviewDuplicates = <Row extends DuplicateReviewFields>(
  rows: Row[],
  existingFingerprints: Iterable<string>
): Row[] => {
  const existing = new Set(existingFingerprints);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.fingerprint) continue;
    counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1);
  }

  return rows.map((row) => {
    const fingerprint = row.fingerprint;
    const duplicate =
      Boolean(fingerprint) &&
      (existing.has(fingerprint as string) || (counts.get(fingerprint as string) ?? 0) > 1);
    const hadDuplicate = row.duplicate === true;
    let excluded = row.excluded === true;
    let overrideDuplicate = row.overrideDuplicate === true;

    if (!duplicate) {
      excluded = false;
      overrideDuplicate = false;
    } else if (!hadDuplicate) {
      excluded = true;
      overrideDuplicate = false;
    }

    const warnings = row.warnings.filter((warning) => warning !== DUPLICATE_WARNING);
    if (duplicate) {
      warnings.push(DUPLICATE_WARNING);
    }

    return {
      ...row,
      duplicate,
      excluded,
      overrideDuplicate,
      warnings,
    };
  });
};
