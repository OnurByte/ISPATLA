import { ImageResponse } from "next/og";
import { readPublicXPostShare } from "@/server/hit-sharing";
import { ogFontsForText } from "@/server/og-fonts";
import { compactOfficialMetric } from "@/lib/social-sharing";
import { requestPublicLocale } from "@/components/public-header";
import { socialCopy } from "@/i18n/social-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "Resmî X API gözlemi ve gönderi metrikleri";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const locale = await requestPublicLocale();
  const words = socialCopy[locale];
  const text = share.text.slice(0, 200);
  const fonts = await ogFontsForText(text + " " + share.accountHandle + " " + words.observation);
  const metrics = [
    [words.views, share.metrics.views],
    [words.likes, share.metrics.likes],
    [words.replies, share.metrics.replies],
    [words.reposts, share.metrics.reposts],
  ] as const;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 58px", borderTop: "18px solid #315BF5", background: "#F0EDE5", color: "#16191E", fontFamily: fonts.map(f => f.name).join(", ") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 23, letterSpacing: 2 }}>
        <span>ISPATLA</span><span style={{ color: "#315BF5" }}>{words.observation}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 19, padding: "25px 30px", border: "1px solid #D4D2CA", borderRadius: 18, background: "#FFFFFF" }}>
        <div style={{ fontSize: 27, color: "#315BF5" }}>@{share.accountHandle}</div>
        <div style={{ fontSize: 31, lineHeight: 1.23, maxHeight: 165, overflow: "hidden", whiteSpace: "pre-wrap" }}>{text}</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 15, paddingTop: 16, borderTop: "1px solid #DDDCD6" }}>
          {metrics.map(([name, value]) =>
            <div key={name} style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ color: "#52605D", fontSize: 18 }}>{name}</span>
              <span style={{ fontSize: 29 }}>{compactOfficialMetric(value)}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#52605D" }}>
        <span>{words.disclaimer.slice(0, 105)}</span>
        <span>{new Date(share.observedAt * 1000).toISOString().slice(0, 10)} UTC</span>
      </div>
    </div>,
    { ...size, fonts, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
