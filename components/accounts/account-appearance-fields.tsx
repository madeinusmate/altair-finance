"use client";

import { useRef, useState } from "react";
import { AccountMark } from "@/components/accounts/account-mark";
import { getIconComponent, POPULAR_ICONS } from "@/components/category-management/category-edit-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readAvatarFile } from "@/lib/read-avatar-file";

type AccountAppearanceFieldsProps = {
  name: string;
  icon: string;
  iconImage: string;
  onIconChange: (value: string) => void;
  onIconImageChange: (value: string) => void;
  disabled?: boolean;
};

const iconLabel = (iconName: string) => iconName.replace(/([A-Z])/g, " $1").trim();

export const AccountAppearanceFields = ({
  name,
  icon,
  iconImage,
  onIconChange,
  onIconImageChange,
  disabled,
}: AccountAppearanceFieldsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const currentIcon = icon && !POPULAR_ICONS.includes(icon) ? icon : null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onIconImageChange(await readAvatarFile(file));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not use that photo.");
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="account-icon">Icon</Label>
      <div className="flex items-start gap-4">
        <AccountMark
          name={name || "Account"}
          icon={icon}
          iconImage={iconImage}
          className="size-16 text-lg"
          iconClassName="h-7 w-7"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Select
            value={icon || "__none__"}
            onValueChange={(next) => onIconChange(next === "__none__" ? "" : next)}
            disabled={disabled}
          >
            <SelectTrigger id="account-icon" className="w-full">
              {icon && getIconComponent(icon) ? (
                <div className="flex items-center gap-2">
                  {getIconComponent(icon)}
                  <SelectValue>{iconLabel(icon)}</SelectValue>
                </div>
              ) : (
                <SelectValue placeholder="Select an icon (optional)" />
              )}
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="__none__">
                <span className="text-muted-foreground">None</span>
              </SelectItem>
              {currentIcon ? (
                <SelectItem value={currentIcon}>
                  <div className="flex items-center gap-2">
                    {getIconComponent(currentIcon)}
                    <span>{iconLabel(currentIcon)}</span>
                  </div>
                </SelectItem>
              ) : null}
              {POPULAR_ICONS.map((iconName) => (
                <SelectItem key={iconName} value={iconName}>
                  <div className="flex items-center gap-2">
                    {getIconComponent(iconName)}
                    <span>{iconLabel(iconName)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Account photo"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {iconImage ? "Change photo" : "Upload photo"}
            </Button>
            {iconImage ? (
              <Button type="button" variant="ghost" disabled={disabled} onClick={() => onIconImageChange("")}>
                Remove photo
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Pick an icon, or upload a JPEG, PNG, or WebP photo to use as the avatar.
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
};
