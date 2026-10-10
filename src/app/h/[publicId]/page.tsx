import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readPublicXPostShare } from "@/server/hit-sharing";
import { publicShareUrl, publicSocialImageUrl } from "@/lib/social-sharing";
import { ShareActions } from "@/components/share-actions";
import { socialCopy } from "@/i18n/social-copy";
import type { Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function displayMetric(value: number | null, locale: Locale): string {
  return value === null ? socialCopy[locale].unknown : new Intl.NumberFormat(locale).format(value);
}

function displayTime(value: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value * 1000)) + " UTC";
}

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) return { title: "Paylaşım bulunamadı · İSPATLA", robots: { index: false, follow: false } };
  const path = "/h/" + publicId;
  const url = publicShareUrl(path);
  const image = publicSocialImageUrl(path);
  const locale = await requestPublicLocale();
  const title = "@" + share.accountHandle + " · " + socialCopy[locale].observation;
  const description = share.text.slice(0, 180) || socialCopy[locale].observation;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: {
      title, description, type: "article", url, siteName: "İSPATLA",
      publishedTime: new Date(share.publishedAt * 1000).toISOString(),
      modifiedTime: new Date(share.observedAt * 1000).toISOString(),
      images: [{ url: image, width: 1200, height: 630, alt: socialCopy[locale].observation + " · İSPATLA" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharedObservedPostPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) notFound();

  const locale = await requestPublicLocale();
  const words = socialCopy[locale];
  return <><PublicHeader locale={locale} /><main className="min-h-screen bg-muted/40 px-4 py-12 text-foreground">
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{words.observation}</p>
        <h1 className="text-2xl font-semibold">{words.publishedBy} @{share.accountHandle}</h1>
        <p className="text-sm text-muted-foreground">{words.publishedAt}: {displayTime(share.publishedAt, locale)} · {words.observedAt}: {displayTime(share.observedAt, locale)}</p>
      </header>
      <blockquote className="whitespace-pre-wrap break-words rounded-2xl bg-muted/40 p-5 text-base leading-7">{share.text}</blockquote>
      <a className="w-fit text-sm font-semibold underline underline-offset-4" href={share.postUrl} rel="noopener noreferrer">{words.openX}</a>
      <section aria-labelledby="metrics-title" className="border-t border-border pt-5">
        <h2 id="metrics-title" className="mb-4 text-lg font-semibold">{words.metricTitle}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([[words.views, share.metrics.views], [words.likes, share.metrics.likes], [words.replies, share.metrics.replies], [words.reposts, share.metrics.reposts], [words.quotes, share.metrics.quotes]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/40 p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{displayMetric(value, locale)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="border-t border-border pt-5" aria-label={words.options}><h2 className="mb-3 text-lg font-semibold">{words.shareProof}</h2><ShareActions url={publicShareUrl("/h/" + publicId)} text={"@" + share.accountHandle + " · " + words.shareText} locale={locale} imageUrl={publicSocialImageUrl("/h/" + publicId)} /></section>
      <p className="text-xs leading-5 text-muted-foreground">{words.disclaimer}</p>
    </article>
  </main></>;
}
