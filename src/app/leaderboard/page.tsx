import Link from "next/link";
import { PublicHeader, requestPublicLocale } from "@/components/public-header";
import { localizePath } from "@/i18n/config";
import { getLeaderboard, LEADERBOARD_TABS, type LeaderboardTab } from "@/server/leaderboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Doğrulanmış hitler · İSPATLA", description: "Kendi geçmişine göre yükselen, resmi X verileriyle doğrulanmış sonuçlar." };
const labels: Record<LeaderboardTab, string> = { week: "Haftanın hitleri", month: "Ayın hitleri", accounts: "En iyi hesap performansı", improvement: "En çok gelişen kullanıcılar" };
const number = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const locale = await requestPublicLocale();
  const path = (href: string) => localizePath(locale, href);
  const query = await searchParams;
  const tab: LeaderboardTab = LEADERBOARD_TABS.includes(query.tab as LeaderboardTab) ? query.tab as LeaderboardTab : "week";
  const board = getLeaderboard();
  const items = board[tab];
  return <><PublicHeader locale={locale} /><main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex justify-end"><Link href={path("/app/settings/profile")} className="text-sm underline underline-offset-4">Katılımı yönet</Link></div>
      <section className="space-y-3"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Resmi X verisi · açık katılım</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hesabına göre gerçek gelişim.</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Gönderiler toplam beğeniyle değil, kendi hesabının önceki sonuçlarına göre sıralanır. Paylaşım ve sıralamaya katılım ayrı seçimlerdir; yalnızca açıkça katılan kartlar görünür.</p></section>
      <nav aria-label="Sıralama türü" className="flex flex-wrap gap-2">{LEADERBOARD_TABS.map((value) => <Link key={value} href={`${path("/leaderboard")}?tab=${value}`} aria-current={value === tab ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm ${value === tab ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{labels[value]}</Link>)}</nav>
      <section aria-labelledby="ranking-title"><h2 id="ranking-title" className="mb-4 text-xl font-semibold">{labels[tab]}</h2>
        {items.length === 0 ? <p className="rounded-2xl border border-dashed p-6 text-sm leading-6 text-muted-foreground">Bu dönem için minimum resmi kanıtı karşılayan ve katılımı açık bir sonuç henüz yok. Yeterli geçmişi olmayan veya gözlem zamanı karşılaştırılamayan gönderiler sıralamaya eklenmez.</p> : <ol className="flex flex-col gap-3">{items.map((item, index) => <li key={item.publicId} className="flex gap-4 rounded-2xl border bg-card p-5"><span className="text-lg font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><Link className="font-semibold underline underline-offset-4" href={path(`/h/${item.publicId}`)}>@{item.accountHandle}</Link>{"relativePerformance" in item ? <><p className="my-2 whitespace-pre-wrap break-words text-sm leading-6">{item.text}</p><p className="text-sm font-semibold text-primary">Kendi geçmişine göre {number.format(item.relativePerformance)}×</p><p className="mt-1 text-xs text-muted-foreground">Takipçi başına etkileşim: %{number.format(item.engagementRate)} · {item.baselineSamples} önceki gözlem · yayın sonrası {number.format((item.observedAt - item.publishedAt) / 3600)} saat</p></> : <><p className="mt-2 text-sm font-semibold text-primary">{tab === "improvement" ? "Önceki aya göre etkileşim oranı" : "Kendi geçmişine göre medyan performans"}: {number.format(item.score)}×</p><p className="mt-1 text-xs text-muted-foreground">Bu ay {item.samples} resmi, karşılaştırılabilir gönderi</p></>}</div></li>)}</ol>}
      </section>
      <details className="rounded-2xl border p-5 text-sm"><summary className="cursor-pointer font-semibold">Nasıl doğruluyoruz ve sıralıyoruz?</summary><div className="mt-4 space-y-3 leading-6 text-muted-foreground"><p>Yalnızca İSPATLA üzerinden onaylanıp yayımlanan, resmi X API&apos;sinden 24–30 saat sonra gözlenen gönderiler kullanılır. Takipçi sayısı aynı gözlem anında resmi X kimliğiyle doğrulanır. Bilinmeyen etkileşimler, bağlantısı kaldırılmış hesaplar ve moderasyonla hariç tutulan kanıtlar sıralanmaz.</p><p>Etkileşim = beğeni + yanıt + yeniden paylaşım + alıntı. Bu toplam, gözlem anındaki takipçi sayısına bölünür. Karşılaştırma, aynı hesabın önceki 90 gündeki en fazla 20 gönderisinin medyanına dayanır; en az 5 önceki gözlem ve gözlem yaşında en fazla %10 fark gerekir. Hit için en az 10 etkileşim ve geçmiş medyanının en az 2 katı gerekir. Sıralama bu kata göre yapılır; hafta ve ay yayın tarihine göre hesaplanır.</p><p>Hesap performansı, bu ay en az 5 karşılaştırılabilir resmi gönderinin performans katlarının medyanıdır. Bu ayki bir kartın katılımını açınca hesabın tüm uygun resmi sonuçları, paylaşılmamış düşük performanslı sonuçlar dahil, hesap ve gelişim hesabında kullanılır. Gelişim, bu ay ve önceki ay ayrı ayrı en az 5 uygun resmi gönderinin takipçi başına etkileşim medyanlarını karşılaştırır; her kullanıcıdan tek hesap görünür. Bunlar gözlemlenen sonuçlardır, virallik veya gelir garantisi değildir. Özel geçmiş gönderilerinin metinleri ve kimlikleri açıklanmaz; katılım, yalnızca karşılaştırma katını ve örnek sayısını görünür kılar.</p></div></details>
    </div>
  </main></>;
}
