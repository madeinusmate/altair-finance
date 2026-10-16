export const DUPLICATE_WARNING = "Possible duplicate";

export type DuplicateReviewFields = {
  fingerprint: string | null;
  duplicate?: boolean;
  excluded?: boolean;
  overrideDuplicate?: boolean;
  warnings: string[];
  errors: string[];
};

// Marks duplicates against the ledger and earlier rows in this file.
// A duplicate is excluded until the person includes it. Including sets overrideDuplicate.
export const applyReviewDuplicates = <Row extends DuplicateReviewFields>(
  rows: Row[],
  existingFingerprints: Iterable<string>
): Row[] => {
  const seen = new Set(existingFingerprints);

  return rows.map((row) => {
    const duplicate = Boolean(row.fingerprint) && seen.has(row.fingerprint as string);
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

    if (row.fingerprint && row.errors.length === 0 && !excluded) {
      seen.add(row.fingerprint);
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
