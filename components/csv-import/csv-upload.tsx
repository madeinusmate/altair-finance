import { useRef } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload } from "lucide-react";

interface CsvUploadProps {
  label: string;
  templateUrl: string;
  fileName?: string;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  onClear?: () => void;
}

export const CsvUpload = ({
  label,
  templateUrl,
  fileName,
  disabled,
  onFileSelected,
  onClear,
}: CsvUploadProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChooseFile = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Upload a CSV file or download the Netly template.
        </p>
        {fileName && (
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{fileName}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
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
        <Button type="button" variant="ghost" asChild>
          <a href={templateUrl} download>
            <Download />
            Download template
          </a>
        </Button>
        {fileName && onClear && (
          <Button type="button" variant="ghost" onClick={onClear} disabled={disabled}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
