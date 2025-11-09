"use client";

import { useEffect, useState, useRef } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<string>('system');
  const currentThemeRef = useRef<string>('system');

  useEffect(() => {
    setMounted(true);
    // Get initial theme from localStorage or default to system
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
    currentThemeRef.current = savedTheme;
    // Apply theme after component is mounted (client-side only)
    setTimeout(() => applyTheme(savedTheme), 0);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (currentThemeRef.current === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, []);

  const applyTheme = (themeValue: string) => {
    if (typeof window === 'undefined') return; // Prevent SSR issues

    const root = document.documentElement;
    if (themeValue === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (themeValue === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      // For system theme, detect system preference
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.setAttribute('data-theme', systemTheme);
    }
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    currentThemeRef.current = newTheme;
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground px-2">Theme</p>
      <div className="flex gap-1.5">
        <button
          onClick={() => handleThemeChange("system")}
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
          onClick={() => handleThemeChange("light")}
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
          onClick={() => handleThemeChange("dark")}
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

