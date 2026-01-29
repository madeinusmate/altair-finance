"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteImportDialog } from "./delete-import-dialog";
import { Trash2 } from "lucide-react";

type Import = {
  id: string;
  type: "transactions" | "balances";
  filename: string;
  fileHash: string;
  rowCount: number;
  createdAt: Date | string;
};

interface ImportHistoryListProps {
  imports: Import[];
  onRefresh: () => void;
}

export const ImportHistoryList = ({ imports, onRefresh }: ImportHistoryListProps) => {
  const [filterType, setFilterType] = useState<"all" | "transactions" | "balances">("all");

  const filteredImports = useMemo(() => {
    if (filterType === "all") {
      return imports;
    }
    return imports.filter((imp) => imp.type === filterType);
  }, [imports, filterType]);

  const formatDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleString();
  };

  if (imports.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No imports found.</p>
        <p className="text-sm mt-2">Start by importing a CSV file.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-type" className="text-sm font-medium">
            Filter by type:
          </label>
          <Select value={filterType} onValueChange={(value) => setFilterType(value as typeof filterType)}>
            <SelectTrigger id="filter-type" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All imports</SelectItem>
              <SelectItem value="transactions">Transactions</SelectItem>
              <SelectItem value="balances">Balances</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredImports.length} {filteredImports.length === 1 ? "import" : "imports"}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredImports.map((importRecord) => (
              <TableRow key={importRecord.id}>
                <TableCell className="font-medium">{importRecord.filename}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{importRecord.type}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(importRecord.createdAt)}
                </TableCell>
                <TableCell className="text-right">{importRecord.rowCount}</TableCell>
                <TableCell className="text-right">
                  <DeleteImportDialog
                    importRecord={importRecord}
                    onDeleted={onRefresh}
                    trigger={
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
