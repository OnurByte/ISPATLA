import { ImageResponse } from "next/og";
import { readPublicXPostShare } from "@/server/hit-sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "Resmi 𝕏 gözlemi ve gönderi metrikleri";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function metric(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default async function OpenGraphImage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f4f2ed", color: "#192326", padding: "54px 64px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 4 }}>İSPATLA</div>
        <div style={{ fontSize: 20, color: "#52605d" }}>RESMİ 𝕏 API GÖZLEMİ</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "22px 28px", borderRadius: 24, background: "#ffffff", border: "1px solid #d4d2ca" }}>
        <div style={{ fontSize: 24, fontWeight: 600 }}>@{share.accountHandle}</div>
        <div style={{ fontSize: 34, lineHeight: 1.25, whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 160 }}>{share.text.slice(0, 220)}</div>
        <div style={{ display: "flex", gap: 20, fontSize: 20, color: "#52605d" }}>
          <span>Görüntülenme {metric(share.metrics.views)}</span><span>Beğeni {metric(share.metrics.likes)}</span><span>Yanıt {metric(share.metrics.replies)}</span><span>Repost {metric(share.metrics.reposts)}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#52605d" }}><span>𝕏 gönderisine ait gözlem</span><span>{new Date(share.observedAt * 1000).toISOString().slice(0, 10)} UTC</span></div>
    </div>,
    { ...size, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
