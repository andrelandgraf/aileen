"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground px-2">Theme</p>
      <div className="flex gap-1.5">
      <button
        onClick={() => setTheme("system")}
        className={`flex-1 flex flex-col items-center justify-center gap-0 py-1.5 px-1 rounded border-2 transition-all ${
          theme === "system"
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50"
        }`}
      >
        <Monitor className="h-4 w-4" />
        <span className="text-xs font-medium">Auto</span>
      </button>
      <button
        onClick={() => setTheme("light")}
        className={`flex-1 flex flex-col items-center justify-center gap-0 py-1.5 px-1 rounded border-2 transition-all ${
          theme === "light"
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50"
        }`}
      >
        <Sun className="h-4 w-4" />
        <span className="text-xs font-medium">Light</span>
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`flex-1 flex flex-col items-center justify-center gap-0 py-1.5 px-1 rounded border-2 transition-all ${
          theme === "dark"
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50"
        }`}
      >
        <Moon className="h-4 w-4" />
        <span className="text-xs font-medium">Dark</span>
      </button>
      </div>
    </div>
  );
}

