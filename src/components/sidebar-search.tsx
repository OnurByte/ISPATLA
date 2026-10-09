"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUp, ArrowDown, CornerDownLeft, X, Gauge, Users, BarChart3, Tag, FileKey2, Trophy, Sparkles, Settings2, UserRound, ShieldCheck, KeyRound, CalendarClock, BookOpen, FileText, LockKeyhole, Globe2, type LucideIcon } from "lucide-react";
import { DEFAULT_LOCALE, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { SEARCH_PAGE_PATHS } from "@/generated/search-routes";

type SearchRoute = { href: string; label: string; group: string; keywords: string; description: string; icon: LucideIcon };

const PAGE_DETAILS: Record<string, { icon: LucideIcon; en: string; tr: string }> = {
  home: { icon: Gauge, en: "Return to the public home page.", tr: "Ana sayfaya dön." },
  dashboard: { icon: Gauge, en: "Review your workspace at a glance.", tr: "Çalışma alanının genel görünümünü incele." },
  accounts: { icon: Users, en: "Connect and manage your 𝕏 accounts.", tr: "𝕏 hesaplarını bağla ve yönet." },
  analytics: { icon: BarChart3, en: "Review publishing and account metrics.", tr: "Yayın ve hesap metriklerini incele." },
  categories: { icon: Tag, en: "Organize the topics used in your workspace.", tr: "Çalışma alanındaki konu kategorilerini düzenle." },
  drafts: { icon: FileText, en: "Create and edit posts before publishing.", tr: "Yayınlamadan önce gönderileri oluştur ve düzenle." },
  evaluation: { icon: Trophy, en: "Compare model quality with your own content.", tr: "Modellerin kalitesini kendi içeriklerinle karşılaştır." },
  onboarding: { icon: Sparkles, en: "Finish connecting your accounts and preferences.", tr: "Hesap bağlantılarını ve tercihlerini tamamla." },
  opportunities: { icon: Sparkles, en: "Find sourced topics worth responding to.", tr: "Yanıt vermeye değer, kaynaklı konuları bul." },
  queue: { icon: CalendarClock, en: "Review posts scheduled for publication.", tr: "Yayınlanmak üzere sıraya alınan gönderileri incele." },
  settings: { icon: Settings2, en: "Manage your workspace preferences.", tr: "Çalışma alanı tercihlerini yönet." },
  appearance: { icon: Settings2, en: "Choose your theme and accent color.", tr: "Tema ve vurgu rengini seç." },
  automation: { icon: CalendarClock, en: "Set up recurring workspace tasks.", tr: "Tekrarlanan çalışma alanı görevlerini ayarla." },
  keys: { icon: KeyRound, en: "Connect AI providers and manage model access.", tr: "Yapay zekâ sağlayıcılarını bağla ve model erişimini yönet." },
  profile: { icon: UserRound, en: "Edit your public profile and sharing details.", tr: "Herkese açık profilini ve paylaşım bilgilerini düzenle." },
  security: { icon: ShieldCheck, en: "Manage sign-in and account security.", tr: "Oturum açma ve hesap güvenliğini yönet." },
  style: { icon: Sparkles, en: "Tune the writing voice for your drafts.", tr: "Taslaklarının yazım tarzını belirle." },
  sources: { icon: Globe2, en: "Review the sources connected to your accounts.", tr: "Hesaplarına bağlı kaynakları incele." },
  docs: { icon: BookOpen, en: "Read product guides and setup instructions.", tr: "Ürün kılavuzlarını ve kurulum yönergelerini oku." },
  "forgot-password": { icon: LockKeyhole, en: "Request a password reset link.", tr: "Şifre sıfırlama bağlantısı iste." },
  leaderboard: { icon: Trophy, en: "Browse verified posts and their results.", tr: "Doğrulanmış gönderileri ve sonuçlarını incele." },
  login: { icon: UserRound, en: "Sign in to your account.", tr: "Hesabına giriş yap." },
  market: { icon: BarChart3, en: "Explore current market signals.", tr: "Güncel pazar sinyallerini keşfet." },
  "no-viral-guarantee": { icon: FileText, en: "Learn what the product does not promise.", tr: "Ürünün hangi sonuçları garanti etmediğini öğren." },
  "open-source": { icon: FileKey2, en: "Review the project and its source code.", tr: "Projeyi ve kaynak kodunu incele." },
  privacy: { icon: ShieldCheck, en: "Read how account and usage data is handled.", tr: "Hesap ve kullanım verilerinin nasıl işlendiğini oku." },
  "research/xpatla-consumer-complaints-2026": { icon: FileText, en: "Read the 𝕏Patla consumer complaint research.", tr: "𝕏Patla tüketici şikâyetleri araştırmasını oku." },
  "reset-password": { icon: LockKeyhole, en: "Choose a new password for your account.", tr: "Hesabın için yeni bir şifre belirle." },
  signup: { icon: UserRound, en: "Create your Ispatla account.", tr: "Ispatla hesabını oluştur." },
  terms: { icon: FileText, en: "Read the service terms.", tr: "Hizmet koşullarını oku." },
  transparency: { icon: ShieldCheck, en: "Review product transparency information.", tr: "Ürün şeffaflığı bilgilerini incele." },
};

const SEARCH_TERMS: Record<string, string> = {
  app: "workspace çalışma alanı panel dashboard",
  settings: "preferences tercih hesap disable deactivate delete sil silme devre dışı bırak hesabı kapat hesap sil",
  appearance: "appearance theme color accent dark light görünüm tema vurgu rengi renk",
  style: "style writing voice tone yazı stili yazım tarz ses ton",
  profile: "profile sharing username bio profil paylaşım kullanıcı adı biyografi",
  security: "security email password password reset account güvenlik e-posta şifre parola",
  automation: "otomasyon automations worker tasks schedule zamanlama planlı görevler",
  keys: "ai models keys provider openai openrouter chatgpt claude api anahtar model sağlayıcı",
  onboarding: "setup kurulum resume başlangıç",
};

export function getSidebarSearchRoutes(locale: Locale): SearchRoute[] {
  const { nav, landing } = getDictionary(locale);
  return [...new Set(SEARCH_PAGE_PATHS)].map((href) => {
    const segment = href.split("/").filter(Boolean).at(-1) || "home";
    const dictionary = nav as unknown as Record<string, string>;
    const label = href === "/"
      ? landing.brand
      : href === "/dashboard"
        ? nav.dashboard
      : segment === "keys"
        ? locale === "tr" ? "Yapay zekâ sağlayıcıları" : "AI providers"
        : segment === "onboarding"
          ? locale === "tr" ? "Kurulum" : "Setup"
          : dictionary[segment] || segment.split("-").map((part) => part[0]?.toLocaleUpperCase() + part.slice(1)).join(" ");
    const group = href === "/profile"
      ? nav.profile
      : href.startsWith("/settings/") || href === "/settings"
      ? nav.settings
      : ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/sources"].includes(href)
        ? nav.primary
        : locale === "tr" ? "Sayfalar" : "Pages";
    const detail = PAGE_DETAILS[segment] ?? { icon: FileText, en: `Open ${label}.`, tr: `${label} sayfasını aç.` };
    return { href, label, group, keywords: `${href.replaceAll("/", " ")} ${SEARCH_TERMS[segment] || ""}`, icon: detail.icon, description: locale === "tr" ? detail.tr : locale === "en" ? detail.en : `${label} · ${group}` };
  });
}

export function getSidebarSearchKeyboardAction(key: string, active: number, routeCount: number): { type: "move"; active: number } | { type: "open"; index: number } | null {
  if (routeCount === 0) return null;
  if (key === "ArrowDown") return { type: "move", active: (active + 1) % routeCount };
  if (key === "ArrowUp") return { type: "move", active: (active - 1 + routeCount) % routeCount };
  if (key === "Enter") return { type: "open", index: active };
  return null;
}

export function isSidebarSearchShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

export function filterSidebarSearchRoutes(routes: SearchRoute[], query: string): SearchRoute[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return routes;
  return routes.filter((route) => `${route.label} ${route.group} ${route.keywords}`.toLocaleLowerCase().includes(normalized));
}

function optionId(href: string) {
  return `sidebar-search-option-${href.replace(/[^a-z0-9]+/gi, "-")}`;
}

const COPY: Record<Locale, { search: string; placeholder: string; description: string; noResults: string; close: string; shortcut: string; navigate: string }> = {
  en: { search: "Search", placeholder: "Search pages and settings…", description: "Jump to a workspace page. Use the arrow keys to move and Enter to open.", noResults: "No matching pages.", close: "Close search", shortcut: "Search", navigate: "Open" },
  "zh-CN": { search: "搜索", placeholder: "搜索页面和设置…", description: "跳转到工作区页面。使用方向键选择，按回车打开。", noResults: "没有匹配页面。", close: "关闭搜索", shortcut: "搜索", navigate: "打开" },
  hi: { search: "खोजें", placeholder: "पेज और सेटिंग खोजें…", description: "कार्यस्थान पेज पर जाएँ। चुनने के लिए तीर और खोलने के लिए Enter दबाएँ।", noResults: "कोई पेज नहीं मिला।", close: "खोज बंद करें", shortcut: "खोज", navigate: "खोलें" },
  es: { search: "Buscar", placeholder: "Buscar páginas y ajustes…", description: "Ve a una página. Usa las flechas para elegir y Enter para abrir.", noResults: "No hay páginas coincidentes.", close: "Cerrar búsqueda", shortcut: "Buscar", navigate: "Abrir" },
  fr: { search: "Rechercher", placeholder: "Rechercher pages et réglages…", description: "Accédez à une page. Flèches pour choisir, Entrée pour ouvrir.", noResults: "Aucune page correspondante.", close: "Fermer la recherche", shortcut: "Rechercher", navigate: "Ouvrir" },
  ar: { search: "بحث", placeholder: "ابحث عن الصفحات والإعدادات…", description: "انتقل إلى صفحة. استخدم الأسهم للاختيار وEnter للفتح.", noResults: "لا توجد صفحات مطابقة.", close: "إغلاق البحث", shortcut: "بحث", navigate: "فتح" },
  bn: { search: "খুঁজুন", placeholder: "পৃষ্ঠা ও সেটিংস খুঁজুন…", description: "কোনো পৃষ্ঠায় যান। বেছে নিতে তীরচিহ্ন, খুলতে Enter চাপুন।", noResults: "মিল থাকা পৃষ্ঠা নেই।", close: "অনুসন্ধান বন্ধ করুন", shortcut: "খুঁজুন", navigate: "খুলুন" },
  "pt-BR": { search: "Buscar", placeholder: "Buscar páginas e configurações…", description: "Acesse uma página. Use as setas para escolher e Enter para abrir.", noResults: "Nenhuma página encontrada.", close: "Fechar busca", shortcut: "Buscar", navigate: "Abrir" },
  ru: { search: "Поиск", placeholder: "Поиск страниц и настроек…", description: "Перейдите на страницу. Стрелки для выбора, Enter для открытия.", noResults: "Страницы не найдены.", close: "Закрыть поиск", shortcut: "Поиск", navigate: "Открыть" },
  id: { search: "Cari", placeholder: "Cari halaman dan pengaturan…", description: "Buka halaman. Gunakan panah untuk memilih dan Enter untuk membuka.", noResults: "Halaman tidak ditemukan.", close: "Tutup pencarian", shortcut: "Cari", navigate: "Buka" },
  ur: { search: "تلاش", placeholder: "صفحات اور ترتیبات تلاش کریں…", description: "صفحے پر جائیں۔ انتخاب کے لیے تیر اور کھولنے کے لیے Enter دبائیں۔", noResults: "کوئی صفحہ نہیں ملا۔", close: "تلاش بند کریں", shortcut: "تلاش", navigate: "کھولیں" },
  de: { search: "Suchen", placeholder: "Seiten und Einstellungen suchen…", description: "Seite öffnen. Mit Pfeilen auswählen, mit Enter öffnen.", noResults: "Keine passenden Seiten.", close: "Suche schließen", shortcut: "Suchen", navigate: "Öffnen" },
  ja: { search: "検索", placeholder: "ページと設定を検索…", description: "ページへ移動。矢印キーで選び、Enterで開きます。", noResults: "一致するページがありません。", close: "検索を閉じる", shortcut: "検索", navigate: "開く" },
  sw: { search: "Tafuta", placeholder: "Tafuta kurasa na mipangilio…", description: "Fungua ukurasa. Tumia mishale kuchagua na Enter kufungua.", noResults: "Hakuna kurasa zinazolingana.", close: "Funga utafutaji", shortcut: "Tafuta", navigate: "Fungua" },
  mr: { search: "शोधा", placeholder: "पृष्ठे आणि सेटिंग्ज शोधा…", description: "पृष्ठ उघडा. निवडण्यासाठी बाण आणि उघडण्यासाठी Enter वापरा.", noResults: "जुळणारी पृष्ठे नाहीत.", close: "शोध बंद करा", shortcut: "शोधा", navigate: "उघडा" },
  te: { search: "వెతకండి", placeholder: "పేజీలు, సెట్టింగ్‌లను వెతకండి…", description: "పేజీకి వెళ్లండి. ఎంచుకోవడానికి బాణాలు, తెరవడానికి Enter నొక్కండి.", noResults: "సరిపోలే పేజీలు లేవు.", close: "శోధనను మూసివేయండి", shortcut: "వెతకండి", navigate: "తెరవండి" },
  tr: { search: "Ara", placeholder: "Sayfa ve ayarlarda ara…", description: "Bir sayfaya geç. Ok tuşlarıyla seç, Enter ile aç.", noResults: "Eşleşen sayfa bulunamadı.", close: "Aramayı kapat", shortcut: "Ara", navigate: "Aç" },
  ta: { search: "தேடு", placeholder: "பக்கங்கள், அமைப்புகளில் தேடு…", description: "பக்கத்திற்குச் செல்லவும். அம்புகளால் தேர்ந்தெடுத்து Enter அழுத்தவும்.", noResults: "பொருந்தும் பக்கங்கள் இல்லை.", close: "தேடலை மூடு", shortcut: "தேடு", navigate: "திற" },
  vi: { search: "Tìm kiếm", placeholder: "Tìm trang và cài đặt…", description: "Đi đến trang. Dùng phím mũi tên để chọn, Enter để mở.", noResults: "Không tìm thấy trang phù hợp.", close: "Đóng tìm kiếm", shortcut: "Tìm kiếm", navigate: "Mở" },
  ko: { search: "검색", placeholder: "페이지와 설정 검색…", description: "페이지로 이동합니다. 방향키로 선택하고 Enter로 엽니다.", noResults: "일치하는 페이지가 없습니다.", close: "검색 닫기", shortcut: "검색", navigate: "열기" },
};

export function SidebarSearch({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const router = useRouter();
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const routes = useMemo(() => filterSidebarSearchRoutes(getSidebarSearchRoutes(locale), query), [locale, query]);
  const groups = useMemo(() => routes.reduce<Record<string, SearchRoute[]>>((result, route) => { (result[route.group] ??= []).push(route); return result; }, {}), [routes]);
  const flat = routes;
  const openSearch = useCallback(() => { setQuery(""); setActive(0); setOpen(true); }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isSidebarSearchShortcut(event)) { event.preventDefault(); openSearch(); }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openSearch]);

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const action = getSidebarSearchKeyboardAction(event.key, active, flat.length);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.type === "move") setActive(action.active);
    else {
      const route = flat[action.index];
      if (route) { setOpen(false); router.push(localizePath(locale, route.href)); }
    }
  }

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger render={<Button variant="outline" className="mx-3 mb-1 h-10 justify-between border-sidebar-border bg-sidebar px-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label={`${copy.search} (⌘K)`} />}>
      <span className="flex items-center gap-2 group-data-[collapsible=icon]:gap-0"><Search aria-hidden="true" className="size-4" /><span className="group-data-[collapsible=icon]:hidden">{copy.search}</span></span><kbd className="rounded border px-1.5 py-0.5 text-[10px] group-data-[collapsible=icon]:hidden">⌘K</kbd>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <Dialog.Popup className="fixed left-1/2 top-[12vh] z-50 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl outline-none">
        <div className="flex items-center gap-3 border-b px-4">
          <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <Dialog.Title className="sr-only">{copy.search}</Dialog.Title>
          <Dialog.Description className="sr-only">{copy.description}</Dialog.Description>
          <input ref={inputRef} autoFocus type="search" role="combobox" aria-expanded="true" aria-controls="sidebar-search-results" aria-activedescendant={routes[active] ? optionId(routes[active].href) : undefined} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={handleSearchKeyDown} placeholder={copy.placeholder} aria-label={copy.search} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <Dialog.Close aria-label={copy.close} className="rounded p-1.5 text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden="true" className="size-4" /></Dialog.Close>
        </div>
        <div id="sidebar-search-results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2" role="listbox" aria-label={copy.search}>
          {routes.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">{copy.noResults}</p> : Object.entries(groups).map(([group, entries]) => <section key={group} aria-label={group} className="py-1">
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            {entries.map((route) => { const index = flat.indexOf(route); const selected = index === active; const Icon = route.icon; return <button key={route.href} id={optionId(route.href)} type="button" role="option" aria-selected={selected} onMouseEnter={() => setActive(index)} onClick={() => { setOpen(false); router.push(localizePath(locale, route.href)); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/60"}`}>
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{route.label}</span><span className="block truncate text-xs text-muted-foreground">{route.description}</span></span>{selected ? <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><CornerDownLeft className="size-3" />{copy.navigate}</span> : null}
            </button>; })}
          </section>)}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" />{copy.search}</span><span><kbd className="rounded border px-1">↵</kbd> {copy.navigate}</span><span className="ml-auto">Esc {copy.close}</span></div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
