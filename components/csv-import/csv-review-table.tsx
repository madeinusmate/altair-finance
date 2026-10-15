import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RowWithIssues = {
  id: string;
  errors: string[];
  warnings: string[];
  duplicate?: boolean;
  excluded?: boolean;
};

type CsvReviewColumn<Row> = {
  key: keyof Row;
  label: string;
  inputType?: "text" | "number" | "date";
  render?: (row: Row, onChange: (value: string) => void) => ReactNode;
};

interface CsvReviewTableProps<Row extends RowWithIssues> {
  columns: CsvReviewColumn<Row>[];
  rows: Row[];
  onRowChange: (rowId: string, key: keyof Row, value: string) => void;
  onToggleExclude?: (rowId: string) => void;
  height?: number;
  rowHeight?: number;
  overscan?: number;
}

export const CsvReviewTable = <Row extends RowWithIssues>({
  columns,
  rows,
  onRowChange,
  onToggleExclude,
  height = 520,
  rowHeight = 72,
  overscan = 6,
}: CsvReviewTableProps<Row>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(height);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight || height);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [height]);

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, totalHeight - endIndex * rowHeight);
  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);
  const columnCount = columns.length + 1;

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-md border"
      style={{ maxHeight: height }}
      onScroll={handleScroll}
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)}>{column.label}</TableHead>
            ))}
            <TableHead>Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topSpacerHeight > 0 && (
            <TableRow className="border-0">
              <TableCell className="p-0" colSpan={columnCount} style={{ height: topSpacerHeight }} />
            </TableRow>
          )}
          {visibleRows.map((row) => (
            <TableRow key={row.id} className={row.excluded ? "opacity-60" : undefined} style={{ height: rowHeight }}>
              {columns.map((column) => {
                const value = String(row[column.key] ?? "");
                const handleChange = (newValue: string) => {
                  onRowChange(row.id, column.key, newValue);
                };

                return (
                  <TableCell key={`${row.id}-${String(column.key)}`}>
                    {column.render ? (
                      column.render(row, handleChange)
                    ) : (
                      <Input
                        value={value}
                        type={column.inputType || "text"}
                        onChange={(event) => handleChange(event.target.value)}
                      />
                    )}
                  </TableCell>
                );
              })}
              <TableCell>
                <div className="max-h-20 space-y-2 overflow-auto">
                  {row.duplicate && onToggleExclude && (
                    <Button
                      type="button"
                      size="sm"
                      variant={row.excluded ? "default" : "outline"}
                      onClick={() => onToggleExclude(row.id)}
                    >
                      {row.excluded ? "Include" : "Exclude"}
                    </Button>
                  )}
                  {row.errors.length > 0 && (
                    <div className="space-y-1">
                      <Badge variant="destructive">{row.errors.length} errors</Badge>
                      <ul className="text-xs text-destructive space-y-1">
                        {row.errors.map((error, index) => (
                          <li key={`${row.id}-error-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {row.warnings.length > 0 && (
                    <div className="space-y-1">
                      <Badge variant="secondary">{row.warnings.length} warnings</Badge>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {row.warnings.map((warning, index) => (
                          <li key={`${row.id}-warning-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {row.errors.length === 0 && row.warnings.length === 0 && (
                    <span className="text-xs text-muted-foreground">No issues</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {bottomSpacerHeight > 0 && (
            <TableRow className="border-0">
              <TableCell className="p-0" colSpan={columnCount} style={{ height: bottomSpacerHeight }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
