import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readPublicXPostShare } from "@/server/hit-sharing";
import { PUBLIC_ORIGIN } from "@/i18n/public-metadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function displayMetric(value: number | null): string {
  return value === null ? "Not provided by X" : new Intl.NumberFormat("en-US").format(value);
}

function displayTime(value: number): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value * 1000)) + " UTC";
}

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) return { title: "Share not found · ISPATLA", robots: { index: false, follow: false } };
  const title = `@${share.accountHandle} · Official X observation`;
  const description = `An observed public post from @${share.accountHandle}, with metrics returned by the X API.`;
  const url = `${PUBLIC_ORIGIN}/h/${publicId}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "article", url, siteName: "ISPATLA — The Signal Press", locale: "en_US", publishedTime: new Date(share.publishedAt * 1000).toISOString(), modifiedTime: new Date(share.observedAt * 1000).toISOString() },
    twitter: { card: "summary", title, description },
  };
}

export default async function SharedObservedPostPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) notFound();

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><main className="min-h-screen bg-muted/40 px-4 py-12 text-foreground">
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
      <header lang="en" className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Official X API observation</p>
        <h1 className="text-2xl font-semibold">Post published by @{share.accountHandle}</h1>
        <p className="text-sm text-muted-foreground">Published: {displayTime(share.publishedAt)} · Observed: {displayTime(share.observedAt)}</p>
      </header>
      <blockquote className="whitespace-pre-wrap break-words rounded-2xl bg-muted/40 p-5 text-base leading-7">{share.text}</blockquote>
      <a lang="en" className="w-fit text-sm font-semibold underline underline-offset-4" href={share.postUrl} rel="noopener noreferrer">Open post on X</a>
      <section lang="en" aria-labelledby="metrics-title" className="border-t border-border pt-5">
        <h2 id="metrics-title" className="mb-4 text-lg font-semibold">Engagement metrics provided by X</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([["Views", share.metrics.views], ["Likes", share.metrics.likes], ["Replies", share.metrics.replies], ["Reposts", share.metrics.reposts], ["Quotes", share.metrics.quotes]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/40 p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{displayMetric(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p lang="en" className="text-xs leading-5 text-muted-foreground">This card shows only observed values returned by the X API. It does not include a success or “hit” classification.</p>
    </article>
  </main></>;
}
