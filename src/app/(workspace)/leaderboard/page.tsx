import { LeaderboardContent, getLeaderboardTab } from "@/components/leaderboard-content";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { getOptionalPageUser } from "@/server/page-auth";
import { getLeaderboard } from "@/server/leaderboard";
import type { Metadata } from "next";
import { ShareActions } from "@/components/share-actions";
import { publicShareUrl, publicSocialImageUrl } from "@/lib/social-sharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Doğrulanmış sonuçlar · İSPATLA",
  description: "Kendi geçmişine göre yükselen, resmî X verileriyle doğrulanmış sonuçlar.",
  alternates: { canonical: publicShareUrl("/leaderboard") },
  openGraph: { type: "website", title: "Doğrulanmış sonuçlar · İSPATLA", description: "Gönüllü katılımla paylaşılan, resmî X verileriyle ölçülmüş sonuçlar.", url: publicShareUrl("/leaderboard"), siteName: "İSPATLA", images: [{ url: publicSocialImageUrl("/leaderboard"), width: 1200, height: 630, alt: "İSPATLA sıralaması" }] },
  twitter: { card: "summary_large_image", images: [publicSocialImageUrl("/leaderboard")] },
};

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const locale = await requestPublicLocale();
  const query = await searchParams;
  const tab = getLeaderboardTab(query.tab);
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* The public ranking remains available if session lookup is unavailable. */ }
  const board = await getLeaderboard();
  return <>{authenticated ? null : <PublicHeader locale={locale} authenticated={false} />}<div className="mx-auto w-full max-w-4xl px-4 pt-7"><ShareActions url={publicShareUrl("/leaderboard")} text="İSPATLA · Resmî X verileriyle doğrulanmış sonuçlar" imageUrl={publicSocialImageUrl("/leaderboard")} /></div><LeaderboardContent locale={locale} tab={tab} board={board} /></>;
}
