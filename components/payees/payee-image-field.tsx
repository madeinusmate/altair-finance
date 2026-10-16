"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { preparePayeeIconImage } from "@/lib/payees/prepare-icon-image";
import { PayeeMark } from "@/components/payees/payee-mark";

type PayeeImageFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export const PayeeImageField = ({ id, value, onChange, disabled }: PayeeImageFieldProps) => {
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await preparePayeeIconImage(file));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not use that image");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {value ? <PayeeMark image={value} fallback="" className="size-8" /> : null}
        <Input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
        {value ? (
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange("")}>
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP. Cropped to 64×64 and stored under 16 KB.</p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
};
