"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const value = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      value={mounted ? value : ""}
      onValueChange={(next) => {
        if (next === "light" || next === "dark") {
          setTheme(next);
        }
      }}
      aria-label="Color theme"
      className="grid w-full grid-cols-2"
    >
      <ToggleGroupItem value="light" aria-label="Light mode" className="w-full rounded-full">
        <Sun />
        Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark mode" className="w-full rounded-full">
        <Moon />
        Dark
      </ToggleGroupItem>
    </ToggleGroup>
  );
};
