import { cn } from "@/lib/utils";

export const segmentedTrackClassName = "flex h-10 w-max items-center rounded-full bg-muted p-1";

const segmentedItemBaseClassName =
  "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-full px-3.5 text-sm leading-none whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const segmentedItemClassName = (selected: boolean) =>
  cn(
    segmentedItemBaseClassName,
    selected
      ? "bg-background font-semibold text-foreground shadow-sm"
      : "font-medium text-muted-foreground",
  );

export const segmentedItemInteractiveClassName = cn(
  segmentedItemBaseClassName,
  "font-medium text-muted-foreground transition-colors disabled:pointer-events-none disabled:opacity-50",
  "data-[state=on]:bg-background data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-sm",
  "data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-sm",
);

export const segmentedTriggerClassName =
  "h-8 gap-2 rounded-full border-0 bg-background px-3.5 font-semibold leading-none text-foreground shadow-sm hover:bg-background has-[>svg]:px-3.5";
