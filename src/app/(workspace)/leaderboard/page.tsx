import { LeaderboardContent, getLeaderboardTab } from "@/components/leaderboard-content";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { getOptionalPageUser } from "@/server/page-auth";
import { getLeaderboard } from "@/server/leaderboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const title = "Verified post performance · ISPATLA";
const description = "Official X observations ranked by each account’s own history, with participation controlled by each account.";
export const metadata = {
  title,
  description,
  alternates: { canonical: "https://ispatla.tr/leaderboard" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "https://ispatla.tr/leaderboard", siteName: "ISPATLA — The Signal Press", locale: "en_US", type: "website" },
  twitter: { card: "summary", title, description },
};

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const locale = await requestPublicLocale();
  const query = await searchParams;
  const tab = getLeaderboardTab(query.tab);
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* The public ranking remains available if session lookup is unavailable. */ }
  const board = await getLeaderboard();
  return <>{authenticated ? null : <PublicHeader locale={locale} authenticated={false} />}<LeaderboardContent locale={locale} tab={tab} board={board} /></>;
}
