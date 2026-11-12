"use client";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

export function ThemeToggle() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("vc-theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
