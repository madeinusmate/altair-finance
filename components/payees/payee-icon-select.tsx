"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getIconComponent, POPULAR_ICONS } from "@/components/category-management/category-edit-dialog";
import { PayeeLogo } from "@/components/payees/payee-logo";
import { PAYEE_LOGOS } from "@/lib/payees/logos";
import { payeeLogoSlug } from "@/lib/payees/catalog";

type PayeeIconSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const iconLabel = (iconName: string) => iconName.replace(/([A-Z])/g, " $1").trim();

export const PayeeIconSelect = ({ id, value, onChange, disabled }: PayeeIconSelectProps) => {
  const logoSlug = payeeLogoSlug(value);
  const logo = logoSlug ? PAYEE_LOGOS[logoSlug] : null;

  return (
    <Select
      value={value || "__none__"}
      onValueChange={(next) => onChange(next === "__none__" ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        {logo && logoSlug ? (
          <div className="flex items-center gap-2">
            <PayeeLogo slug={logoSlug} className="h-4 w-4" />
            <SelectValue>{logo.title}</SelectValue>
          </div>
        ) : value && getIconComponent(value) ? (
          <div className="flex items-center gap-2">
            {getIconComponent(value)}
            <SelectValue>{iconLabel(value)}</SelectValue>
          </div>
        ) : (
          <SelectValue placeholder="Select an icon (optional)" />
        )}
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        <SelectItem value="__none__">
          <span className="text-muted-foreground">None</span>
        </SelectItem>
        {logo && logoSlug ? (
          <SelectItem value={value}>
            <div className="flex items-center gap-2">
              <PayeeLogo slug={logoSlug} className="h-4 w-4" />
              <span>{logo.title}</span>
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
  );
};
