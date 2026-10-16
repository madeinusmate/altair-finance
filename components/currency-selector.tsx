"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CURRENCY_LABELS, type SupportedCurrency } from "@/lib/currencies";
import {
  segmentedItemClassName,
  segmentedTrackClassName,
  segmentedTriggerClassName,
} from "@/lib/ui/segmented";
import { cn } from "@/lib/utils";

type CurrencySelectorProps = {
  currencies: readonly SupportedCurrency[];
  value: SupportedCurrency;
  onChange: (currency: SupportedCurrency) => void;
  className?: string;
};

const availableWidth = (parent: HTMLElement, self: HTMLElement): number => {
  const style = getComputedStyle(parent);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  let siblings = 0;
  let siblingCount = 0;

  for (const child of parent.children) {
    if (child === self || !(child instanceof HTMLElement)) continue;
    if (getComputedStyle(child).display === "none") continue;
    siblings += child.getBoundingClientRect().width;
    siblingCount += 1;
  }

  return parent.clientWidth - padding - siblings - gap * siblingCount;
};

export const CurrencySelector = ({ currencies, value, onChange, className }: CurrencySelectorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    const parent = root?.parentElement;
    if (!root || !measure || !parent) return;

    const update = () => {
      const needed = measure.offsetWidth;
      const available = availableWidth(parent, root);
      if (needed <= 0 || available <= 0) return;
      const next = currencies.length > 1 && needed > available + 1;
      setCompact((current) => (current === next ? current : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [currencies]);

  if (currencies.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative w-max max-w-full", className)}>
      <div className="pointer-events-none absolute h-0 w-0 overflow-hidden" inert aria-hidden>
        <div ref={measureRef} className={segmentedTrackClassName}>
          {currencies.map((currency) => (
            <span key={currency} className={segmentedItemClassName(currency === value)}>
              {currency}
            </span>
          ))}
        </div>
      </div>
      {compact ? (
        <Popover open={open} onOpenChange={setOpen}>
          <div className={segmentedTrackClassName}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={segmentedTriggerClassName}
                aria-label={`Currency, ${value}`}
              >
                {value}
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
          </div>
          <PopoverContent className="w-auto p-4" align="start" collisionPadding={16}>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Currency</Label>
              <div className="grid grid-cols-1 gap-1">
                {currencies.map((currency) => (
                  <Button
                    key={currency}
                    type="button"
                    variant={currency === value ? "default" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      onChange(currency);
                      setOpen(false);
                    }}
                  >
                    <span className="w-8 text-left">{currency}</span>
                    <span className={currency === value ? "font-medium" : "font-medium text-muted-foreground"}>
                      {CURRENCY_LABELS[currency]}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <div className={segmentedTrackClassName} role="group" aria-label="Currency">
          {currencies.map((currency) => (
            <button
              key={currency}
              type="button"
              aria-pressed={currency === value}
              onClick={() => onChange(currency)}
              className={segmentedItemClassName(currency === value)}
            >
              {currency}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
