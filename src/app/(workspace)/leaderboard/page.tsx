import { LeaderboardContent, getLeaderboardTab } from "@/components/leaderboard-content";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { getOptionalPageUser } from "@/server/page-auth";
import { getLeaderboard } from "@/server/leaderboard";
import type { Metadata } from "next";
import { ShareActions } from "@/components/share-actions";
import { publicShareUrl, publicSocialImageUrl } from "@/lib/social-sharing";
import { leaderboardCopy } from "@/i18n/leaderboard-copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestPublicLocale();
  const words = leaderboardCopy[locale];
  return {
    title: words.title + " · İSPATLA",
    description: words.intro,
    alternates: { canonical: publicShareUrl("/leaderboard") },
    openGraph: {
      type: "website", title: words.title + " · İSPATLA", description: words.intro,
      url: publicShareUrl("/leaderboard"), siteName: "İSPATLA",
      images: [{ url: publicSocialImageUrl("/leaderboard"), width: 1200, height: 630, alt: words.title }],
    },
    twitter: { card: "summary_large_image", title: words.title, description: words.intro, images: [publicSocialImageUrl("/leaderboard")] },
  };
}


export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const locale = await requestPublicLocale();
  const query = await searchParams;
  const tab = getLeaderboardTab(query.tab);
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* The public ranking remains available if session lookup is unavailable. */ }
  const board = await getLeaderboard();
  return <>{authenticated ? null : <PublicHeader locale={locale} authenticated={false} />}<div className="mx-auto w-full max-w-4xl px-4 pt-7"><ShareActions url={publicShareUrl("/leaderboard")} text={"İSPATLA · " + leaderboardCopy[locale].title} locale={locale} imageUrl={publicSocialImageUrl("/leaderboard")} /></div><LeaderboardContent locale={locale} tab={tab} board={board} /></>;
}
