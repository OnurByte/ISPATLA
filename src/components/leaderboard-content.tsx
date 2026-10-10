import Link from "next/link";
import { localizePath, type Locale } from "@/i18n/config";
import { LEADERBOARD_TABS, type Leaderboard, type LeaderboardTab } from "@/server/leaderboard";

const labels: Record<LeaderboardTab, string> = { week: "This week’s hits", month: "This month’s hits", accounts: "Top account performance", improvement: "Most improved accounts" };
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function getLeaderboardTab(value?: string | string[]): LeaderboardTab {
  return typeof value === "string" && LEADERBOARD_TABS.includes(value as LeaderboardTab) ? value as LeaderboardTab : "week";
}

export function LeaderboardContent({ locale, tab, board }: {
  locale: Locale;
  tab: LeaderboardTab;
  board: Leaderboard;
}) {
  const path = (href: string) => localizePath(locale, href);
  const items = board[tab];

  return <main lang="en" className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex justify-end"><Link href={path("/profile")} className="text-sm underline underline-offset-4">Manage participation</Link></div>
      <section className="space-y-3"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Official X data · opt-in participation</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Real progress against your own history.</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Posts are ranked against each account’s previous results, not by total likes. Sharing a post and opting into the rankings are separate choices; only posts explicitly opted in appear.</p></section>
      <nav aria-label="Ranking period" className="flex flex-wrap gap-2">{LEADERBOARD_TABS.map((value) => <Link key={value} href={`${path("/leaderboard")}?tab=${value}`} aria-current={value === tab ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm ${value === tab ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{labels[value]}</Link>)}</nav>
      <section aria-labelledby="ranking-title"><h2 id="ranking-title" className="mb-4 text-xl font-semibold">{labels[tab]}</h2>
        {items.length === 0 ? <p className="rounded-2xl border border-dashed p-6 text-sm leading-6 text-muted-foreground">No results for this period currently meet the minimum official-evidence threshold and have opted in. Posts without enough history or comparable observation timing are excluded.</p> : <ol className="flex flex-col gap-3">{items.map((item, index) => <li key={item.publicId} className="flex gap-4 rounded-2xl border bg-card p-5"><span className="text-lg font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><Link className="font-semibold underline underline-offset-4" href={path(`/h/${item.publicId}`)}>@{item.accountHandle}</Link>{"relativePerformance" in item ? <><p className="my-2 whitespace-pre-wrap break-words text-sm leading-6">{item.text}</p><p className="text-sm font-semibold text-primary">vs. own history: {number.format(item.relativePerformance)}×</p><p className="mt-1 text-xs text-muted-foreground">Engagement per follower: {number.format(item.engagementRate)}% · {item.baselineSamples} prior observations · {number.format((item.observedAt - item.publishedAt) / 3600)} hours after publishing</p></> : <><p className="mt-2 text-sm font-semibold text-primary">{tab === "improvement" ? "Engagement-rate change vs. last month" : "Median performance vs. own history"}: {number.format(item.score)}×</p><p className="mt-1 text-xs text-muted-foreground">{item.samples} official, comparable posts this month</p></>}</div></li>)}</ol>}
      </section>
      <details className="rounded-2xl border p-5 text-sm"><summary className="cursor-pointer font-semibold">How are results verified and ranked?</summary><div className="mt-4 space-y-3 leading-6 text-muted-foreground"><p>We use only posts approved and published through ISPATLA, then observed through the official X API 24–30 hours later. Follower counts are verified against the official X user ID at the same observation time. Unknown engagement, disconnected accounts, and evidence excluded by moderation are not ranked.</p><p>Engagement = likes + replies + reposts + quotes. This total is divided by the follower count at observation time. The baseline is the median of up to 20 posts from the same account in the previous 90 days; it requires at least 5 prior observations, with observation ages within 10%. A hit requires at least 10 engagements and at least twice the account’s baseline median. Posts are ranked by this multiple; weekly and monthly periods use the publishing date.</p><p>Account performance is the median performance multiple across at least 5 comparable official posts this month. Opting in for a card makes all eligible official results from that account available to the account and improvement calculations, including low-performing results that were not individually shared. Improvement compares median engagement per follower for this month and last month, each with at least 5 eligible official posts; one account is shown per user. These are observed results, not a promise of virality or income. Text and IDs of private historical posts are not disclosed; opting in reveals only the relative multiple and sample count.</p></div></details>
    </div>
  </main>;
}
