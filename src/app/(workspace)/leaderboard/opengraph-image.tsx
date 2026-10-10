import { ImageResponse } from "next/og";
import { ogFontsForText } from "@/server/og-fonts";
import { requestOpenGraphLocale } from "@/i18n/og-locale";
import { leaderboardCopy } from "@/i18n/leaderboard-copy";

export const runtime = "nodejs";
export const alt = "İSPATLA · Resmî X verilerine dayalı herkese açık sıralama";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function LeaderboardImage() {
  const locale = await requestOpenGraphLocale();
  const words = leaderboardCopy[locale];
  const fonts = await ogFontsForText("İSPATLA " + words.title + " " + words.eyebrow + " " + words.intro);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "55px 65px", borderTop: "18px solid #315BF5", background: "#F0EDE5", color: "#16191E", fontFamily: fonts.map(f => f.name).join(", ") }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23, letterSpacing: 3 }}>
        <span>ISPATLA</span><span style={{ color: "#315BF5" }}>PUBLIC LEADERBOARD</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, lineHeight: 1.08 }}>{words.title}</div>
        <div style={{ fontSize: 31, color: "#52605D" }}>{words.intro}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #C7C5BC", paddingTop: 20, fontSize: 21 }}>
        <span>{words.eyebrow}</span><span>ispatla.tr/leaderboard</span>
      </div>
    </div>,
    { ...size, fonts, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
