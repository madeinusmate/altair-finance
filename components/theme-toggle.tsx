"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      value={mounted && theme ? theme : ""}
      onValueChange={(next) => {
        if (next === "light" || next === "dark" || next === "system") {
          setTheme(next);
        }
      }}
      aria-label="Color theme"
    >
      {themes.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value} aria-label={`${item.label} mode`}>
          <item.icon />
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};
