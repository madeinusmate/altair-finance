import { segmentedItemClassName, segmentedTrackClassName } from "@/lib/ui/segmented";
import { cn } from "@/lib/utils";

type CsvReviewFilter = "all" | "valid" | "invalid" | "warnings" | "duplicates";

interface CsvImportSummaryProps {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  duplicates: number;
  activeFilter?: CsvReviewFilter;
  onFilterChange?: (filter: CsvReviewFilter) => void;
}

const formatCount = (value: number) => value.toLocaleString();

const rowLabel = (count: number) => (count === 1 ? "row" : "rows");

const selectionCopy = (filter: CsvReviewFilter, count: number) => {
  const amount = `${formatCount(count)} ${rowLabel(count)}`;
  switch (filter) {
    case "valid":
      return `The table shows ${amount} that will be imported.`;
    case "invalid":
      return `The table shows ${amount} with errors.`;
    case "warnings":
      return `The table shows ${amount} with warnings.`;
    case "duplicates":
      return `The table shows ${amount} marked as duplicates.`;
    case "all":
    default:
      return `The table shows all ${amount}.`;
  }
};

export const CsvImportSummary = ({
  total,
  valid,
  invalid,
  warnings,
  duplicates,
  activeFilter,
  onFilterChange,
}: CsvImportSummaryProps) => {
  const isInteractive = Boolean(onFilterChange && activeFilter);
  const options: Array<{ id: CsvReviewFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: total },
    { id: "valid", label: "Valid", count: valid },
    { id: "invalid", label: "Invalid", count: invalid },
    { id: "warnings", label: "Warnings", count: warnings },
    { id: "duplicates", label: "Duplicates", count: duplicates },
  ];

  if (!isInteractive || !activeFilter || !onFilterChange) {
    return (
      <p className="text-sm text-muted-foreground">
        {formatCount(total)} rows · {formatCount(valid)} valid · {formatCount(invalid)} invalid ·{" "}
        {formatCount(warnings)} warnings · {formatCount(duplicates)} duplicates
      </p>
    );
  }

  const selected = options.find((option) => option.id === activeFilter) ?? options[0];

  return (
    <fieldset className="min-w-0 space-y-2 border-0 p-0">
      <legend className="text-sm text-muted-foreground">Filter the table</legend>
      <div className="max-w-full overflow-x-auto">
        <div className={segmentedTrackClassName} role="radiogroup" aria-label="Filter the table">
          {options.map((option) => {
            const isSelected = activeFilter === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  segmentedItemClassName(isSelected),
                  "cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30",
                )}
              >
                <input
                  type="radio"
                  name="import-review-filter"
                  value={option.id}
                  checked={isSelected}
                  onChange={() => onFilterChange(option.id)}
                  className="sr-only"
                />
                <span>{option.label}</span>
                <span className={cn("tabular-nums", isSelected ? "text-foreground/60" : "text-muted-foreground")}>
                  {formatCount(option.count)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <p className="text-sm text-foreground" aria-live="polite">
        {selectionCopy(selected.id, selected.count)}
      </p>
    </fieldset>
  );
};
