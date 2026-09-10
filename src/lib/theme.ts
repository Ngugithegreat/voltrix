"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// Inline script (string) run before hydration to avoid a flash of the wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('voltrix-theme');if(t==='light'){document.documentElement.classList.add('light');}}catch(e){}})();`;

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("themechange", cb);
  return () => window.removeEventListener("themechange", cb);
}
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function toggleTheme() {
  const isLight = document.documentElement.classList.toggle("light");
  try {
    localStorage.setItem("voltrix-theme", isLight ? "light" : "dark");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("themechange"));
}
