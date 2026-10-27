import { expect, test } from "bun:test";
import { isDarkAppearance, persistAppearancePreference, readAppearancePreferences } from "../src/components/theme-provider";

test("theme selection resolves the matching light or dark surface", () => {
  expect(isDarkAppearance("dark", false)).toBe(true);
  expect(isDarkAppearance("light", true)).toBe(false);
  expect(isDarkAppearance("system", true)).toBe(true);
  expect(isDarkAppearance("system", false)).toBe(false);
});

test("appearance preferences accept only known values and preserve the existing theme key", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", accent: "blue", storageAvailable: true });
  expect(persistAppearancePreference(storage, "theme", "dark")).toBe(true);
  expect(persistAppearancePreference(storage, "ispatla-motion", "reduce")).toBe(true);
  expect(persistAppearancePreference(storage, "ispatla-accent", "violet")).toBe(true);
  expect(readAppearancePreferences(storage)).toEqual({ theme: "dark", motion: "reduce", accent: "violet", storageAvailable: true });
  values.set("theme", "unknown");
  values.set("ispatla-motion", "animate");
  values.set("ispatla-accent", "not-a-color");
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", accent: "blue", storageAvailable: true });
});

test("unavailable or quota-limited storage falls back safely without throwing", () => {
  const storage = { getItem: (): string | null => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", accent: "blue", storageAvailable: false });
  expect(persistAppearancePreference(storage, "theme", "light")).toBe(false);
});
