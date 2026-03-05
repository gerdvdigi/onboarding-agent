"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Cambiar tema"
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full p-1",
        "bg-muted/80 text-muted-foreground",
        "ring-1 ring-border/50",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Modo claro"
        aria-pressed={theme === "light"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
          theme === "light"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "hover:text-foreground/80"
        )}
      >
        <Sun className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Modo oscuro"
        aria-pressed={theme === "dark"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
          theme === "dark"
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "hover:text-foreground/80"
        )}
      >
        <Moon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
