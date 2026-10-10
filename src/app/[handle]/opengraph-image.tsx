import { ImageResponse } from "next/og";
import { findPublicProfileByPath } from "@/server/public-profile";
import { ogFontsForText } from "@/server/og-fonts";
import { requestPublicLocale } from "@/components/public-header";
import { socialCopy } from "@/i18n/social-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "İSPATLA herkese açık profil kartı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProfileImage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await findPublicProfileByPath(handle);
  if (!profile) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const locale = await requestPublicLocale();
  const words = socialCopy[locale];
  const name = (profile.displayName || words.unnamed).slice(0, 90);
  const bio = (profile.bio || words.noBio).slice(0, 200);
  const account = profile.xHandle ? "@" + profile.xHandle : words.profile;
  const fonts = await ogFontsForText(name + " " + bio + " " + account);

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "55px 65px", borderTop: "18px solid #315BF5", background: "#F0EDE5", color: "#16191E", fontFamily: fonts.map(f => f.name).join(", ") }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23, letterSpacing: 3 }}>
        <span>ISPATLA</span><span style={{ color: "#315BF5" }}>PUBLIC PROFILE</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: name.length > 35 ? 53 : 70, lineHeight: 1.1, maxHeight: 180, overflow: "hidden" }}>{name}</div>
        <div style={{ fontSize: 28, color: "#315BF5" }}>{account}</div>
        <div style={{ fontSize: 25, lineHeight: 1.3, maxHeight: 115, color: "#52605D", overflow: "hidden" }}>{bio}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #C7C5BC", paddingTop: 20, fontSize: 20 }}>
        <span>{words.profile}</span><span>ispatla.tr</span>
      </div>
    </div>,
    { ...size, fonts, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
