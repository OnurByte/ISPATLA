import Link from "next/link"
import { CreatorCard } from "@/components/creator-card"
import { ArrowRight, ArrowUpRight, Check, Radio, ScanSearch, Send } from "lucide-react"

const steps = [
  { icon: Radio, title: "Kaynakları izle", description: "Seçtiğin hesaplardan yeni postları topla ve kaynağıyla birlikte sakla." },
  { icon: ScanSearch, title: "Fırsatı değerlendir", description: "Adayları konu, uygunluk ve kanıtla incele; elenenleri de görünür tut." },
  { icon: Send, title: "Taslağı yayına taşı", description: "Hesap stilinde taslak hazırla, düzenle, onayla ve sonucu reconciliation ile izle." },
]

export default function Home() {
  return <main className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <Link href="/" className="text-sm font-bold tracking-[0.16em]">İSPATLA<span className="text-blue-600">.</span></Link>
      <nav aria-label="Ana menü" className="flex items-center gap-3 text-sm">
        <Link className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block" href="/docs">Ürün turu</Link>
        <Link className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground" href="/login">Giriş yap</Link>
        <Link className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href="/signup">Başla <ArrowRight className="ml-1 inline size-4" aria-hidden="true" /></Link>
      </nav>
    </header>

    <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:pb-28">
      <div>
        <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-blue-700 dark:text-blue-300"><span className="size-2 rounded-full bg-blue-600" aria-hidden="true" /> X için araştırma ve yayın masası</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">Sinyali bul.<br /><span className="text-blue-700 dark:text-blue-300">Kanıtla ilerle.</span></h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">İSPATLA, X kaynaklarını fırsata, fırsatları düzenlenebilir taslaklara ve yayın sonuçlarını ölçüme bağlar.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/signup" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Hesap oluştur <ArrowRight className="size-4" aria-hidden="true" /></Link>
          <a href="https://github.com/OnurByte/Ispatla" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-5 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Kaynak kodu <ArrowUpRight className="size-4" aria-hidden="true" /></a>
        </div>
      </div>

      <section aria-label="Örnek kaynak, fırsat, taslak ve yayın akışı" className="relative rounded-xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Örnek akış · ürün turu</p><p className="mt-1 text-sm font-semibold">Kaynak → karar → yayın</p></div>
          <span className="rounded-full border border-blue-600/20 bg-blue-600/5 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">kanıt görünür</span>
        </div>
        <ol className="space-y-3">
          {[
            ["01", "Kaynak post", "@seçili_kaynak · özgün bağlantı"],
            ["02", "Fırsat", "uygunluk ve nedenleri inceleniyor"],
            ["03", "Taslak", "hesap sesiyle düzenlenebilir metin"],
            ["04", "Yayın sonucu", "yerel durum ve X kanıtı ayrı tutulur"],
          ].map(([step, title, detail], index) => <li key={step} className="relative grid grid-cols-[2.5rem_1fr] gap-3 rounded-lg border p-3 sm:p-4">
            {index < 3 && <span className="absolute -bottom-4 left-[1.9rem] h-4 border-l border-dashed border-blue-600/40" aria-hidden="true" />}
            <span className={`flex size-9 items-center justify-center rounded-md text-xs font-semibold ${index === 3 ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}>{index === 3 ? <Check className="size-4" aria-hidden="true" /> : step}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span></span>
          </li>)}
        </ol>
      </section>
    </section>

    <section className="border-y bg-muted/30">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, description }, index) => <article key={title} className="flex gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-blue-700 dark:text-blue-300"><Icon className="size-5" aria-hidden="true" /></span>
          <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{String(index + 1).padStart(2, "0")}</p><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>
        </article>)}
      </div>
    </section>

    <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-[.17em] text-blue-700 dark:text-blue-300">Yerel çalıştır, kaynağı incele</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">Kontrol odasının nasıl çalıştığını gör.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">Kimlik bilgisi gerektirmeyen demo ile kaynak, taslak ve makbuz akışını incele. Bağlantı ve yayın izninin nerede başladığı görünür kalsın.</p><Link href="/docs" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md border px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Dokümantasyon ve demo <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
      <CreatorCard />
    </section>
    <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>İSPATLA · X için araştırma ve yayın masası</span>
      <nav aria-label="Güven ve ürün bilgileri" className="flex flex-wrap gap-x-5 gap-y-3">{[["/docs","Dokümantasyon"],["/security","Güvenlik"],["/privacy","Gizlilik"],["/terms","Kullanım sınırları"]].map(([href,label])=><Link key={href} href={href} className="underline underline-offset-4">{label}</Link>)}</nav>
    </footer>
  </main>
}
