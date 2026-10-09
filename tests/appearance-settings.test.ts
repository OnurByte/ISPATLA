import { expect, test } from "bun:test";
import { isDarkAppearance, paintBrandFavicon, persistAppearancePreference, readAppearancePreferences } from "../src/components/theme-provider";

test("theme selection resolves the matching light or dark favicon surface", () => {
  expect(isDarkAppearance("dark", false)).toBe(true);
  expect(isDarkAppearance("light", true)).toBe(false);
  expect(isDarkAppearance("system", true)).toBe(true);
  expect(isDarkAppearance("system", false)).toBe(false);
});

test("favicon composition keeps a transparent corner on the selected black or white surface", () => {
  class PixelCanvas {
    pixels = Array.from({ length: 4 }, () => ({ color: "transparent", alpha: 0 }));
    globalCompositeOperation: GlobalCompositeOperation = "source-over";
    fillStyle: string | CanvasGradient = "#000000";
    clearRect() { this.pixels = this.pixels.map(() => ({ color: "transparent", alpha: 0 })); }
    drawImage() { this.pixels[3] = { color: "mark", alpha: 1 }; }
    createLinearGradient() {
      const stops: string[] = [];
      return { addColorStop: (_offset: number, color: string) => { stops.push(color); }, color: () => stops[0] } as unknown as CanvasGradient & { color: () => string };
    }
    fillRect() {
      const color = typeof this.fillStyle === "string" ? this.fillStyle : (this.fillStyle as CanvasGradient & { color?: () => string }).color?.() ?? "gradient";
      if (this.globalCompositeOperation === "source-in") this.pixels = this.pixels.map((pixel) => pixel.alpha ? { color, alpha: pixel.alpha } : { color: "transparent", alpha: 0 });
      else if (this.globalCompositeOperation === "destination-over") this.pixels = this.pixels.map((pixel) => pixel.alpha ? pixel : { color, alpha: 1 });
    }
  }

  const darkCanvas = new PixelCanvas();
  paintBrandFavicon(darkCanvas as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, true, "#315bf5", "#12a89d", "#f08b3e");
  expect(darkCanvas.pixels[0]).toEqual({ color: "#000000", alpha: 1 });
  expect(darkCanvas.pixels[3]).toEqual({ color: "#315bf5", alpha: 1 });

  const lightCanvas = new PixelCanvas();
  paintBrandFavicon(lightCanvas as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, false, "#315bf5", "#12a89d", "#f08b3e");
  expect(lightCanvas.pixels[0]).toEqual({ color: "#ffffff", alpha: 1 });
  expect(lightCanvas.pixels[3]).toEqual({ color: "#315bf5", alpha: 1 });
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
