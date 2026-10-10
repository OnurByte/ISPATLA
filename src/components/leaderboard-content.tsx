import Link from "next/link";
import { localizePath, type Locale } from "@/i18n/config";
import { LEADERBOARD_TABS, type Leaderboard, type LeaderboardTab } from "@/server/leaderboard";
import { leaderboardCopy } from "@/i18n/leaderboard-copy";


export function getLeaderboardTab(value?: string | string[]): LeaderboardTab {
  return typeof value === "string" && LEADERBOARD_TABS.includes(value as LeaderboardTab) ? value as LeaderboardTab : "week";
}

export function LeaderboardContent({ locale, tab, board }: {
  locale: Locale;
  tab: LeaderboardTab;
  board: Leaderboard;
}) {
  const path = (href: string) => localizePath(locale, href);
  const words = leaderboardCopy[locale];
  const labels: Record<LeaderboardTab, string> = { week: words.week, month: words.month, accounts: words.accounts, improvement: words.improvement };
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const items = board[tab];

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex justify-end"><Link href={path("/profile")} className="text-sm underline underline-offset-4">{words.manage}</Link></div>
      <section className="space-y-3"><p className="text-xs font-semibold uppercase tracking-widest text-primary">{words.eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{words.title}</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">{words.intro}</p></section>
      <nav aria-label={words.type} className="flex flex-wrap gap-2">{LEADERBOARD_TABS.map((value) => <Link key={value} href={`${path("/leaderboard")}?tab=${value}`} aria-current={value === tab ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm ${value === tab ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{labels[value]}</Link>)}</nav>
      <section aria-labelledby="ranking-title"><h2 id="ranking-title" className="mb-4 text-xl font-semibold">{labels[tab]}</h2>
        {items.length === 0 ? <p className="rounded-2xl border border-dashed p-6 text-sm leading-6 text-muted-foreground">{words.empty}</p> : <ol className="flex flex-col gap-3">{items.map((item, index) => <li key={item.publicId} className="flex gap-4 rounded-2xl border bg-card p-5"><span className="text-lg font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><Link className="font-semibold underline underline-offset-4" href={path(`/h/${item.publicId}`)}>@{item.accountHandle}</Link>{"relativePerformance" in item ? <><p className="my-2 whitespace-pre-wrap break-words text-sm leading-6">{item.text}</p><p className="text-sm font-semibold text-primary">{words.relative} {number.format(item.relativePerformance)}×</p><p className="mt-1 text-xs text-muted-foreground">{words.rate}: {number.format(item.engagementRate)}% · {item.baselineSamples} {words.previous} · {number.format((item.observedAt - item.publishedAt) / 3600)} {words.hours}</p></> : <><p className="mt-2 text-sm font-semibold text-primary">{tab === "improvement" ? words.monthlyImprovement : words.accountMedian}: {number.format(item.score)}×</p><p className="mt-1 text-xs text-muted-foreground">{item.samples} {words.monthlyPosts}</p></>}</div></li>)}</ol>}
      </section>
      <details className="rounded-2xl border p-5 text-sm"><summary className="cursor-pointer font-semibold">{words.method}</summary><div className="mt-4 space-y-3 leading-6 text-muted-foreground"><p>{words.methodOne}</p><p>{words.methodTwo}</p><p>{words.methodThree}</p></div></details>
    </div>
  </main>;
}
