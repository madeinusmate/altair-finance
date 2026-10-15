import { Button } from "@/components/ui/button";

type DuplicateDecisionBarProps = {
  count: number;
  held: number;
  onSkipAll: () => void;
  onImportAll: () => void;
};

export const DuplicateDecisionBar = ({ count, held, onSkipAll, onImportAll }: DuplicateDecisionBarProps) => {
  if (count === 0) return null;
  const importing = count - held;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
      <p className="text-sm">
        {count} exact duplicate {count === 1 ? "row matches" : "rows match"} another row in this file or a transaction already in the books.
        {" "}
        {held} will be skipped and {importing} will be imported.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onSkipAll}>
        Skip all
      </Button>
      <Button type="button" size="sm" onClick={onImportAll}>
        Import all
      </Button>
    </div>
  );
};
