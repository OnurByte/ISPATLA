import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readPublicXPostShare } from "@/server/hit-sharing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function displayMetric(value: number | null): string {
  return value === null ? "𝕏 tarafından sunulmadı" : new Intl.NumberFormat("tr-TR").format(value);
}

function displayTime(value: number): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value * 1000)) + " UTC";
}

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) return { title: "Paylaşım bulunamadı · İSPATLA", robots: { index: false, follow: false } };
  const title = `@${share.accountHandle} · resmi 𝕏 gözlemi`;
  const description = share.text.slice(0, 180);
  return {
    title,
    description,
    openGraph: { title, description, type: "article", url: `/h/${publicId}`, siteName: "İSPATLA", publishedTime: new Date(share.publishedAt * 1000).toISOString(), modifiedTime: new Date(share.observedAt * 1000).toISOString() },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedObservedPostPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const share = await readPublicXPostShare(publicId);
  if (!share) notFound();

  const locale = await requestPublicLocale();
  return <><PublicHeader locale={locale} /><main className="min-h-screen bg-muted/40 px-4 py-12 text-foreground">
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resmi 𝕏 API gözlemi</p>
        <h1 className="text-2xl font-semibold">@{share.accountHandle} tarafından yayımlanan gönderi</h1>
        <p className="text-sm text-muted-foreground">Yayımlanma: {displayTime(share.publishedAt)} · Gözlem: {displayTime(share.observedAt)}</p>
      </header>
      <blockquote className="whitespace-pre-wrap break-words rounded-2xl bg-muted/40 p-5 text-base leading-7">{share.text}</blockquote>
      <a className="w-fit text-sm font-semibold underline underline-offset-4" href={share.postUrl} rel="noopener noreferrer">Gönderiyi 𝕏&apos;te aç</a>
      <section aria-labelledby="metrics-title" className="border-t border-border pt-5">
        <h2 id="metrics-title" className="mb-4 text-lg font-semibold">𝕏&apos;in sunduğu etkileşim sayıları</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([["Görüntülenme", share.metrics.views], ["Beğeni", share.metrics.likes], ["Yanıt", share.metrics.replies], ["Yeniden paylaşım", share.metrics.reposts], ["Alıntı", share.metrics.quotes]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-muted/40 p-4">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-semibold">{displayMetric(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-xs leading-5 text-muted-foreground">Bu kart yalnızca 𝕏 API&apos;sinden alınan gözlem değerlerini gösterir. Başarı veya “hit” sınıflandırması içermez.</p>
    </article>
  </main></>;
}
