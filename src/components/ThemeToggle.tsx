"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// State initializer reads localStorage synchronously during the first render,
// avoiding a second render cycle. The useEffect below still handles the DOM
// side effect (adding the class), but the state is correct from the start
// so the icon doesn't flash.
function getInitialTheme(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("theme") === "dark";
}

export function ThemeToggle() {
  const [dark, setDark] = useState(getInitialTheme);

  // Apply the dark class on mount if needed. This runs after first paint
  // but the state initializer ensures the correct icon renders immediately.
  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-[--radius-md] p-2 text-ct-muted hover:text-ct-ink transition-colors"
    >
      {dark ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}
