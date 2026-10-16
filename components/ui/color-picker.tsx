"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const ColorPicker = ({
  value,
  onChange,
  disabled,
  id,
  className,
}: ColorPickerProps) => {
  const [hexValue, setHexValue] = React.useState(value || "");

  React.useEffect(() => {
    setHexValue(value || "");
  }, [value]);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setHexValue(newValue);
    onChange(newValue);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;
    // Ensure it starts with #
    if (!newValue.startsWith("#")) {
      newValue = "#" + newValue;
    }
    // Validate hex color format
    if (/^#[0-9A-Fa-f]{0,6}$/.test(newValue)) {
      setHexValue(newValue);
      // Only call onChange if it's a valid 6-digit hex
      if (newValue.length === 7) {
        onChange(newValue);
      }
    }
  };

  const handleHexBlur = () => {
    // If empty, clear the value
    if (!hexValue || hexValue === "#") {
      setHexValue("");
      onChange("");
      return;
    }
    // Ensure we have a valid hex color on blur
    if (hexValue.length < 7) {
      const padded = hexValue.padEnd(7, "0");
      setHexValue(padded);
      onChange(padded);
    } else if (hexValue.length === 7) {
      onChange(hexValue);
    }
  };

  const displayValue = hexValue || "#000000";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        <input
          type="color"
          value={displayValue}
          onChange={handleColorChange}
          disabled={disabled}
          id={id}
          className={cn(
            "h-10 w-16 cursor-pointer rounded-md border border-input bg-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-md",
            "[&::-moz-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md"
          )}
        />
      </div>
      <Input
        type="text"
        value={hexValue || ""}
        onChange={handleHexChange}
        onBlur={handleHexBlur}
        placeholder="#000000"
        disabled={disabled}
        className="flex-1 font-mono text-sm"
        maxLength={7}
      />
    </div>
  );
};
