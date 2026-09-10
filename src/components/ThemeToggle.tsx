"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const light = theme === "light";
  return (
    <button
      onClick={toggleTheme}
      title={light ? "Switch to dark" : "Switch to light"}
      aria-label="Toggle theme"
      className={`btn btn-ghost h-9 w-9 p-0 ${className}`}
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
