"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"

import { segmentedItemInteractiveClassName, segmentedTrackClassName } from "@/lib/ui/segmented"
import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"

type ToggleGroupVariant = NonNullable<VariantProps<typeof toggleVariants>["variant"]> | "segmented"

const ToggleGroupContext = React.createContext<{
  variant?: ToggleGroupVariant
  size?: VariantProps<typeof toggleVariants>["size"]
  spacing?: number
}>({
  size: "default",
  variant: "default",
  spacing: 0,
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  variant?: ToggleGroupVariant
  size?: VariantProps<typeof toggleVariants>["size"]
  spacing?: number
}) {
  const segmented = variant === "segmented"

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={segmented ? undefined : ({ "--gap": spacing } as React.CSSProperties)}
      className={cn(
        "group/toggle-group",
        segmented
          ? segmentedTrackClassName
          : "flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  variant?: ToggleGroupVariant
  size?: VariantProps<typeof toggleVariants>["size"]
}) {
  const context = React.useContext(ToggleGroupContext)
  const resolvedVariant = context.variant || variant
  const segmented = resolvedVariant === "segmented"

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={resolvedVariant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        segmented
          ? segmentedItemInteractiveClassName
          : cn(
              toggleVariants({
                variant: resolvedVariant,
                size: context.size || size,
              }),
              "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
              "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
            ),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
