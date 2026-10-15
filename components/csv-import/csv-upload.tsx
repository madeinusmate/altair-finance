import { useRef, useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Upload } from "lucide-react";
import { countCsvRows, getExampleCsvPlaceholder } from "@/lib/csv/parse";
import type { ImportType } from "@/hooks/use-import-wizard";

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

  useEffect(() => {
    setLocalPasteContent(pasteContent);
  }, [pasteContent]);

  useEffect(() => {
    console.log("CsvUpload: fileName prop changed to:", fileName);
    // Auto-switch to paste tab if pasteContent exists, upload tab if fileName exists
    if (pasteContent && pasteContent.trim()) {
      setActiveTab("paste");
    } else if (fileName) {
      setActiveTab("upload");
    }
  }, [pasteContent, fileName]);

  const handleChooseFile = () => {
    console.log("handleChooseFile called, inputRef.current:", inputRef.current);
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    console.log("handleFileChange called", event.target.files);
    const file = event.target.files?.[0];
    console.log("Selected file:", file);
    if (file) {
      console.log("Calling onFileSelected with file:", file.name);
      // Clear paste content when file is selected (but don't call onPasteChange to avoid clearing fileName)
      setLocalPasteContent("");
      onFileSelected(file);
      setActiveTab("upload");
    }
    event.target.value = "";
  };

  const handlePasteChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const content = event.target.value;
    setLocalPasteContent(content);
    if (onPasteChange) {
      onPasteChange(content);
    }
    // Clear file selection when paste content is entered
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
    // Clear opposite mode when switching tabs
    if (value === "paste" && fileName && onClear) {
      onClear();
    } else if (value === "upload" && localPasteContent.trim() && onPasteChange) {
      onPasteChange("");
      setLocalPasteContent("");
    }
  };

  const rowCount = localPasteContent.trim() ? countCsvRows(localPasteContent) : 0;
  const examplePlaceholder = getExampleCsvPlaceholder(importType);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Upload a CSV file or paste CSV rows directly. Download the Altair template for reference.
          </p>
          {fileName && (
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{fileName}</span>
            </p>
          )}
          {localPasteContent.trim() && rowCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Pasted: <span className="font-medium text-foreground">Pasted CSV ({rowCount} rows)</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" asChild>
            <a href={templateUrl} download>
              <Download />
              Download template
            </a>
          </Button>
          {(fileName || localPasteContent.trim()) && onClear && (
            <Button type="button" variant="ghost" onClick={onClear} disabled={disabled}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="paste">Paste CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-4">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={disabled}
            />
            <Button type="button" variant="outline" onClick={handleChooseFile} disabled={disabled}>
              <Upload />
              Choose CSV
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="paste" className="mt-4">
          <div className="space-y-2">
            <div className="relative flex border rounded-md overflow-hidden bg-background max-h-[600px]">
              {/* Line numbers */}
              <div
                ref={lineNumbersRef}
                className="font-mono text-xs text-muted-foreground bg-muted/50 px-3 py-3 select-none shrink-0 overflow-y-auto"
                style={{ minWidth: "3rem", lineHeight: "1.5rem" }}
              >
                {localPasteContent
                  .split("\n")
                  .map((_, index) => (
                    <div key={index} className="text-right pr-2" style={{ height: "1.5rem" }}>
                      {index + 1}
                    </div>
                  ))}
                {localPasteContent.trim() === "" && (
                  <div className="text-right pr-2 opacity-50" style={{ height: "1.5rem" }}>
                    1
                  </div>
                )}
              </div>
              {/* Textarea */}
              <div className="relative flex-1 overflow-hidden">
                <Textarea
                  ref={textareaRef}
                  value={localPasteContent}
                  onChange={handlePasteChange}
                  onScroll={handleTextareaScroll}
                  placeholder={examplePlaceholder}
                  disabled={disabled}
                  className="font-mono text-sm min-h-[300px] max-h-[600px] border-0 rounded-none pl-3 pr-3 py-3 focus-visible:ring-0 overflow-y-auto resize-none"
                  style={{
                    lineHeight: "1.5rem",
                  }}
                />
                {localPasteContent.trim() && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 text-xs text-muted-foreground pointer-events-none">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs pointer-events-auto"
                      onClick={handleClearPaste}
                      disabled={disabled}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {rowCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {rowCount} {rowCount === 1 ? "row" : "rows"} detected
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
