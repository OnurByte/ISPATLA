import { LeaderboardContent, getLeaderboardTab } from "@/components/leaderboard-content";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { getOptionalPageUser } from "@/server/page-auth";
import { getLeaderboard } from "@/server/leaderboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Doğrulanmış hitler · İSPATLA", description: "Kendi geçmişine göre yükselen, resmi 𝕏 verileriyle doğrulanmış sonuçlar." };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const locale = await requestPublicLocale();
  const query = await searchParams;
  const tab = getLeaderboardTab(query.tab);
  let authenticated = false;
  try { authenticated = Boolean(await getOptionalPageUser()); } catch { /* The public ranking remains available if session lookup is unavailable. */ }
  return <>{authenticated ? null : <PublicHeader locale={locale} authenticated={false} />}<LeaderboardContent locale={locale} tab={tab} board={getLeaderboard()} /></>;
}
