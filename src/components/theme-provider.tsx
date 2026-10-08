"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type MotionPreference = "system" | "reduce";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; motion: MotionPreference; setMotion: (motion: MotionPreference) => void; storageAvailable: boolean };
const ThemeContext = React.createContext<ThemeContextValue>({ theme: "system", setTheme: () => undefined, motion: "system", setMotion: () => undefined, storageAvailable: true });

export function readAppearancePreferences(storage: Pick<Storage, "getItem">) {
  try {
    const theme = storage.getItem("theme");
    const motion = storage.getItem("ispatla-motion");
    return { theme: theme === "light" || theme === "dark" ? theme : "system", motion: motion === "reduce" ? "reduce" : "system", storageAvailable: true } as const;
  } catch {
    return { theme: "system", motion: "system", storageAvailable: false } as const;
  }
}

export function persistAppearancePreference(storage: Pick<Storage, "setItem">, key: "theme" | "ispatla-motion", value: Theme | MotionPreference): boolean {
  try { storage.setItem(key, value); return true; } catch { return false; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [motion, setMotionState] = React.useState<MotionPreference>("system");
  const [storageAvailable, setStorageAvailable] = React.useState(true);

  React.useEffect(() => {
    let stored: ReturnType<typeof readAppearancePreferences>;
    try { stored = readAppearancePreferences(window.localStorage); }
    catch { stored = { theme: "system", motion: "system", storageAvailable: false }; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted client preference once.
    setThemeState(stored.theme);
    setMotionState(stored.motion);
    setStorageAvailable(stored.storageAvailable);
  }, []);

  React.useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  function persist(key: "theme" | "ispatla-motion", value: Theme | MotionPreference) {
    try { setStorageAvailable(persistAppearancePreference(window.localStorage, key, value)); }
    catch { setStorageAvailable(false); }
  }

  function setTheme(next: Theme) {
    setThemeState(next);
    persist("theme", next);
  }

  function setMotion(next: MotionPreference) {
    setMotionState(next);
    persist("ispatla-motion", next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme, motion, setMotion, storageAvailable }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
