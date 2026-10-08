import { expect, test } from "bun:test";
import { persistAppearancePreference, readAppearancePreferences } from "../src/components/theme-provider";

test("appearance preferences accept only known values and preserve the existing theme key", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", storageAvailable: true });
  expect(persistAppearancePreference(storage, "theme", "dark")).toBe(true);
  expect(persistAppearancePreference(storage, "ispatla-motion", "reduce")).toBe(true);
  expect(readAppearancePreferences(storage)).toEqual({ theme: "dark", motion: "reduce", storageAvailable: true });
  values.set("theme", "unknown");
  values.set("ispatla-motion", "animate");
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", storageAvailable: true });
});

test("unavailable or quota-limited storage falls back safely without throwing", () => {
  const storage = { getItem: (): string | null => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  expect(readAppearancePreferences(storage)).toEqual({ theme: "system", motion: "system", storageAvailable: false });
  expect(persistAppearancePreference(storage, "theme", "light")).toBe(false);
});
