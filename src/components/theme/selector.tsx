"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-2">
      <p id="theme-selector-label" className="text-xs text-muted-foreground">
        Theme
      </p>
      <div
        role="group"
        aria-labelledby="theme-selector-label"
        className="grid grid-cols-3 gap-2"
      >
        <Button
          variant={theme === "system" ? "default" : "outline"}
          size="sm"
          onClick={() => setTheme("system")}
        >
          <Monitor className="h-5 w-5" />
          <span className="text-xs font-medium">Auto</span>
        </Button>
        <Button
          variant={theme === "light" ? "default" : "outline"}
          size="sm"
          onClick={() => setTheme("light")}
        >
          <Sun className="h-5 w-5" />
          <span className="text-xs font-medium">Light</span>
        </Button>
        <Button
          variant={theme === "dark" ? "default" : "outline"}
          size="sm"
          onClick={() => setTheme("dark")}
        >
          <Moon className="h-5 w-5" />
          <span className="text-xs font-medium">Dark</span>
        </Button>
      </div>
    </div>
  );
}
