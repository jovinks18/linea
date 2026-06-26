"use client";

import { useEffect, useSyncExternalStore } from "react";

type ThemeMode = "dark" | "light";

const themeChangeEvent = "linea-theme-change";

function getThemeSnapshot(): ThemeMode {
  if (typeof window === "undefined") return "dark";

  return window.localStorage.getItem("linea-theme") === "light"
    ? "light"
    : "dark";
}

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(themeChangeEvent, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    getThemeSnapshot,
    () => "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("linea-theme", nextTheme);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
