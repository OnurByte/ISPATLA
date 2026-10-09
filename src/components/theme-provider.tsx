"use client";

import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type MotionPreference = "system" | "reduce";
export function isDarkAppearance(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark);
}
export function paintBrandFavicon(context: CanvasRenderingContext2D, image: CanvasImageSource, dark: boolean, brandStart: string, brandMid: string, brandEnd: string) {
  context.clearRect(0, 0, 64, 64);
  context.globalCompositeOperation = "source-over";
  context.drawImage(image, 0, 0, 64, 64);
  context.globalCompositeOperation = "source-in";
  const gradient = context.createLinearGradient(0, 0, 64, 64);
  gradient.addColorStop(0, brandStart);
  gradient.addColorStop(0.5, brandMid);
  gradient.addColorStop(1, brandEnd);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = dark ? "#000000" : "#ffffff";
  context.fillRect(0, 0, 64, 64);
  context.globalCompositeOperation = "source-over";
}
export const ACCENT_COLORS = ["blue", "green", "orange", "violet", "rose"] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; motion: MotionPreference; setMotion: (motion: MotionPreference) => void; accent: AccentColor; setAccent: (accent: AccentColor) => void; storageAvailable: boolean };
const ThemeContext = React.createContext<ThemeContextValue>({ theme: "system", setTheme: () => undefined, motion: "system", setMotion: () => undefined, accent: "blue", setAccent: () => undefined, storageAvailable: true });

export function readAppearancePreferences(storage: Pick<Storage, "getItem">) {
  try {
    const theme = storage.getItem("theme");
    const motion = storage.getItem("ispatla-motion");
    const storedAccent = storage.getItem("ispatla-accent");
    const accent = ACCENT_COLORS.includes(storedAccent as AccentColor) ? storedAccent as AccentColor : "blue";
    return { theme: theme === "light" || theme === "dark" ? theme : "system", motion: motion === "reduce" ? "reduce" : "system", accent, storageAvailable: true } as const;
  } catch {
    return { theme: "system", motion: "system", accent: "blue", storageAvailable: false } as const;
  }
}

export function persistAppearancePreference(storage: Pick<Storage, "setItem">, key: "theme" | "ispatla-motion" | "ispatla-accent", value: Theme | MotionPreference | AccentColor): boolean {
  try { storage.setItem(key, value); return true; } catch { return false; }
}

export function ThemeProvider({ children, forceSystemTheme = false }: { children: React.ReactNode; forceSystemTheme?: boolean }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [motion, setMotionState] = React.useState<MotionPreference>("system");
  const [accent, setAccentState] = React.useState<AccentColor>("blue");
  const [storageAvailable, setStorageAvailable] = React.useState(true);

  React.useEffect(() => {
    let stored: ReturnType<typeof readAppearancePreferences>;
    try { stored = readAppearancePreferences(window.localStorage); }
    catch { stored = { theme: "system", motion: "system", accent: "blue", storageAvailable: false }; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the persisted client preference once.
    setThemeState(stored.theme);
    setMotionState(stored.motion);
    setAccentState(stored.accent);
    setStorageAvailable(stored.storageAvailable);
  }, [forceSystemTheme]);

  const effectiveTheme = forceSystemTheme ? "system" : theme;

  React.useEffect(() => {
    const apply = () => {
      const dark = effectiveTheme === "dark" || (effectiveTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (effectiveTheme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [effectiveTheme]);

  React.useEffect(() => {
    document.documentElement.dataset.accent = accent;
    let cancelled = false;
    let observer: MutationObserver | undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const image = new Image();
    const drawFavicon = () => {
      if (!image.complete || !image.naturalWidth || cancelled) return;
      const dark = isDarkAppearance(effectiveTheme, media.matches);
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) return;
      const colors = getComputedStyle(document.documentElement);
      paintBrandFavicon(
        context,
        image,
        dark,
        colors.getPropertyValue("--brand-start").trim() || "#315bf5",
        colors.getPropertyValue("--brand-mid").trim() || "#12a89d",
        colors.getPropertyValue("--brand-end").trim() || "#f08b3e",
      );
      const favicon = document.querySelector<HTMLLinkElement>("#ispatla-accent-icon") || document.createElement("link");
      favicon.id = "ispatla-accent-icon";
      favicon.rel = "icon";
      favicon.type = "image/png";
      favicon.href = canvas.toDataURL();
      const keepLast = () => {
        if (document.head.querySelector('link[rel="icon"]:last-of-type') !== favicon) document.head.append(favicon);
      };
      document.head.append(favicon);
      // Next refreshes metadata during navigation; keep the preference icon after its static fallback.
      observer?.disconnect();
      observer = new MutationObserver(keepLast);
      observer.observe(document.head, { childList: true });
    };
    image.onload = drawFavicon;
    if (effectiveTheme === "system") media.addEventListener("change", drawFavicon);
    image.src = "/brand/ispatla-symbol.png";
    return () => { cancelled = true; observer?.disconnect(); media.removeEventListener("change", drawFavicon); };
  }, [accent, effectiveTheme]);

  React.useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  function persist(key: "theme" | "ispatla-motion" | "ispatla-accent", value: Theme | MotionPreference | AccentColor) {
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

  function setAccent(next: AccentColor) {
    setAccentState(next);
    persist("ispatla-accent", next);
  }

  return <ThemeContext.Provider value={{ theme: effectiveTheme, setTheme, motion, setMotion, accent, setAccent, storageAvailable }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}
