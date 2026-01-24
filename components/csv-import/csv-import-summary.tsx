import { Badge, badgeVariants } from "@/components/ui/badge";
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
  const handleFilter = (filter: CsvReviewFilter) => {
    if (!onFilterChange || !activeFilter) {
      return;
    }
    onFilterChange(activeFilter === filter ? "all" : filter);
  };

  const renderChip = (label: string, value: number, filter: CsvReviewFilter, variant: "default" | "secondary" | "destructive" | "outline") => {
    if (!isInteractive) {
      return (
        <Badge variant={variant}>
          {label}: {value}
        </Badge>
      );
    }

    const isActive = activeFilter === filter || (activeFilter === "all" && filter === "all");
    return (
      <button
        type="button"
        className={cn(
          badgeVariants({ variant }),
          "cursor-pointer transition-opacity",
          isActive ? "opacity-100" : "opacity-70 hover:opacity-100"
        )}
        aria-pressed={isActive}
        onClick={() => handleFilter(filter)}
      >
        {label}: {value}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {renderChip("Rows", total, "all", "secondary")}
      {renderChip("Valid", valid, "valid", "default")}
      {renderChip("Invalid", invalid, "invalid", invalid > 0 ? "destructive" : "secondary")}
      {renderChip("Warnings", warnings, "warnings", warnings > 0 ? "secondary" : "outline")}
      {renderChip("Duplicates", duplicates, "duplicates", duplicates > 0 ? "secondary" : "outline")}
    </div>
  );
};
