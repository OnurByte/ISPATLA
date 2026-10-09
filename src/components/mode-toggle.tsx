"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ModeToggle({ label = "Toggle theme" }: { label?: string }) {
  const { setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="rounded-none border-[var(--press-ink)]/30 bg-[var(--press-surface)] text-[var(--press-ink)] hover:bg-[var(--press-ink)]/10"
      onClick={() => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" data-icon="inline-start" aria-hidden="true" />
      <Moon className="dark:hidden" data-icon="inline-start" aria-hidden="true" />
    </Button>
  );
}
