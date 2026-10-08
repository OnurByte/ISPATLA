import Link from "next/link";
import type {ReactNode} from "react";
const links=[["/docs","Dokümantasyon"],["/security","Güvenlik"],["/privacy","Gizlilik"],["/terms","Kullanım sınırları"]] as const;
export function PublicPage({title,summary,children}:{title:string;summary:string;children:ReactNode}){
 return <main className="min-h-screen bg-background text-foreground">
  <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8"><Link href="/" className="text-sm font-bold tracking-[.16em]">İSPATLA<span className="text-blue-600">.</span></Link><Link className="min-h-11 rounded-md border px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" href="/login">Kontrol odasına giriş</Link></header>
  <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-16"><p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-700 dark:text-blue-300">İncelenebilir ürün, görünür sınırlar</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{summary}</p>
   <nav aria-label="Ürün ve güven bilgileri" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b pb-5 text-sm">{links.map(([href,label])=><Link key={href} href={href} className="min-h-11 py-3 underline decoration-border underline-offset-4 hover:decoration-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600">{label}</Link>)}</nav>
   <div className="mt-10 grid gap-9 lg:grid-cols-[minmax(0,46rem)_1fr]">{children}</div>
  </div>
  <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t px-5 py-7 text-xs text-muted-foreground sm:px-8"><Link href="/">İSPATLA · X araştırma ve yayın masası</Link><a href="https://github.com/OnurByte/Ispatla" target="_blank" rel="noreferrer" className="underline underline-offset-4">Kaynak kodu · AGPL-3.0-or-later</a></footer>
 </main>;
}
export function PublicSection({title,children}:{title:string;children:ReactNode}){return <section className="space-y-3"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><div className="space-y-3 text-sm leading-7 text-muted-foreground">{children}</div></section>;}
