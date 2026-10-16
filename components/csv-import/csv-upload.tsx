import { useRef, useState, useEffect, type DragEvent } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { countCsvRows, getExampleCsvPlaceholder } from "@/lib/csv/parse";
import type { ImportType } from "@/hooks/use-import-wizard";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface CsvUploadProps {
  label: string;
  templateUrl: string;
  fileName?: string;
  disabled?: boolean;
  importType?: ImportType;
  pasteContent?: string;
  onFileSelected: (file: File) => void;
  onPasteChange?: (content: string) => void;
  onClear?: () => void;
}

export const CsvUpload = ({
  label,
  templateUrl,
  fileName,
  disabled,
  importType = "transactions",
  pasteContent = "",
  onFileSelected,
  onPasteChange,
  onClear,
}: CsvUploadProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [localPasteContent, setLocalPasteContent] = useState(pasteContent);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setLocalPasteContent(pasteContent);
  }, [pasteContent]);

  useEffect(() => {
    if (pasteContent && pasteContent.trim()) {
      setActiveTab("paste");
    } else if (fileName) {
      setActiveTab("upload");
    }
  }, [pasteContent, fileName]);

  const handleChooseFile = () => {
    inputRef.current?.click();
  };

  const applyFile = (file: File) => {
    setLocalPasteContent("");
    onFileSelected(file);
    setActiveTab("upload");
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      applyFile(file);
    }
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) {
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      applyFile(file);
    }
  };

  const handlePasteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const content = event.target.value;
    setLocalPasteContent(content);
    if (onPasteChange) {
      onPasteChange(content);
    }
    if (content.trim() && fileName && onClear) {
      onClear();
    }
  };

  const handleClearPaste = () => {
    setLocalPasteContent("");
    if (onPasteChange) {
      onPasteChange("");
    }
  };

  const handleTextareaScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "upload" | "paste");
    if (value === "paste" && fileName && onClear) {
      onClear();
    } else if (value === "upload" && localPasteContent.trim() && onPasteChange) {
      onPasteChange("");
      setLocalPasteContent("");
    }
  };

  const handleClearAll = () => {
    setLocalPasteContent("");
    if (onPasteChange) {
      onPasteChange("");
    }
    onClear?.();
  };

  const rowCount = localPasteContent.trim() ? countCsvRows(localPasteContent) : 0;
  const examplePlaceholder = getExampleCsvPlaceholder(importType);
  const hasSelection = Boolean(fileName || localPasteContent.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={templateUrl} download>
            <Download />
            Download template
          </a>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="upload">Upload file</TabsTrigger>
          <TabsTrigger value="paste">Paste CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
          <Empty
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "w-full transition-colors",
              isDragging && "border-primary bg-primary/5",
              fileName && "border-solid border-primary/30 bg-muted/20"
            )}
          >
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {fileName ? <FileSpreadsheet /> : <Upload />}
              </EmptyMedia>
              <EmptyTitle>{fileName ?? "Drop your CSV here"}</EmptyTitle>
              <EmptyDescription>
                {fileName
                  ? "File ready to process. Choose another file to replace it."
                  : "Drag and drop a .csv file, or click to browse."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-none">
              <Button type="button" variant="outline" disabled={disabled} onClick={handleChooseFile}>
                <Upload />
                {fileName ? "Replace file" : "Choose CSV"}
              </Button>
            </EmptyContent>
          </Empty>
        </TabsContent>

        <TabsContent value="paste" className="mt-4 space-y-2">
          <div className="relative flex max-h-[min(600px,50vh)] overflow-hidden rounded-lg border bg-background">
            <div
              ref={lineNumbersRef}
              className="shrink-0 overflow-y-auto bg-muted/50 px-3 py-3 font-mono text-xs text-muted-foreground select-none"
              style={{ minWidth: "3rem", lineHeight: "1.5rem" }}
            >
              {localPasteContent.split("\n").map((_, index) => (
                <div key={index} className="pr-2 text-right" style={{ height: "1.5rem" }}>
                  {index + 1}
                </div>
              ))}
              {localPasteContent.trim() === "" && (
                <div className="pr-2 text-right opacity-50" style={{ height: "1.5rem" }}>
                  1
                </div>
              )}
            </div>
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={localPasteContent}
                onChange={handlePasteChange}
                onScroll={handleTextareaScroll}
                placeholder={examplePlaceholder}
                disabled={disabled}
                className="min-h-[min(300px,40vh)] max-h-[min(600px,50vh)] resize-none rounded-none border-0 py-3 pl-3 pr-3 font-mono text-sm focus-visible:ring-0"
                style={{ lineHeight: "1.5rem" }}
              />
            </div>
          </div>
          {rowCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {rowCount} {rowCount === 1 ? "row" : "rows"} detected
            </p>
          )}
          {localPasteContent.trim() && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClearPaste} disabled={disabled}>
              Clear pasted content
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {hasSelection && onClear && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleClearAll} disabled={disabled}>
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
};
