import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SIGNAL_PRESS_PATHS } from "@/i18n/public-metadata";
import { DEFAULT_LOCALE, isLocale, LOCALE_CONFIG, type Locale } from "@/i18n/config";
import { docsCopy } from "@/i18n/docs-copy";
import { getSignalPressCopy } from "@/i18n/signal-press";
import { publicEvidencePageCopy } from "@/i18n/public-evidence-copy";

export const runtime = "nodejs";

const scriptFont: Partial<Record<Locale, string>> = {
  ar: "arabic", ur: "arabic", hi: "devanagari", mr: "devanagari", bn: "bengali", ta: "tamil", te: "telugu", "zh-CN": "cjk", ja: "cjk", ko: "cjk",
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const path = query.get("page") || "/";
  if (!(SIGNAL_PRESS_PATHS as readonly string[]).includes(path)) return new Response("Not found", { status: 404 });
  const requestedLocale = query.get("locale") || DEFAULT_LOCALE;
  if (!isLocale(requestedLocale)) return new Response("Invalid locale", { status: 400 });
  const locale = requestedLocale;
  const copy = getSignalPressCopy(locale);
  // Satori shapes Arabic glyphs but needs explicit word order for RTL lines.
  const rtl = LOCALE_CONFIG[locale].dir === "rtl";
  const title = path === "/" ? `${copy.headline} ${copy.headlineAccent}` : path === "/docs" ? docsCopy[locale].title : publicEvidencePageCopy(locale, path as Parameters<typeof publicEvidencePageCopy>[1]).title;
  const fontNames = ["latin", "math", ...(scriptFont[locale] ? [scriptFont[locale]!] : [])];
  const fonts = await Promise.all(fontNames.map(async (name) => ({
    name: `Signal Press ${name}`,
    data: await readFile(join(process.cwd(), "public", "fonts", `og-${name}.${name === "cjk" ? "otf" : "ttf"}`)),
    style: "normal" as const,
    weight: 400 as const,
  })));
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: "#F0EDE5", color: "#16191E", padding: 56, borderTop: "18px solid #315BF5", fontFamily: fontNames.map((name) => `Signal Press ${name}`).join(", ") }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, letterSpacing: 3 }}><span>ISPATLA</span><span>THE SIGNAL PRESS / 2026</span></div>
      <div lang={locale} style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", flexWrap: "wrap", fontSize: title.length > 75 ? 54 : 72, lineHeight: 1.15, maxWidth: 1060 }}>{rtl ? title.split(" ").map((word, index) => <span key={index} style={{ marginLeft: 18 }}>{word}</span>) : title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, borderTop: "2px solid #16191E", paddingTop: 24 }}><span style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row" }}>{rtl ? copy.manifestoKicker.split(" ").map((word, index) => <span key={index} style={{ marginLeft: 8 }}>{word}</span>) : copy.manifestoKicker}</span><span>ispatla.tr</span></div>
    </div>,
    { width: 1200, height: 630, fonts, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
