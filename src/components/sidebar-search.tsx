"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUp, ArrowDown, CornerDownLeft, X, Gauge, Users, BarChart3, Tag, FileKey2, Trophy, Radar, ClipboardList, PenLine, Settings2, UserRound, ShieldCheck, KeyRound, CalendarClock, BookOpen, FileText, LockKeyhole, Globe2, type LucideIcon } from "lucide-react";
import { DEFAULT_LOCALE, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { useUiText } from "@/i18n/ui-client";
import { Button } from "@/components/ui/button";
import { SEARCH_PAGE_PATHS } from "@/generated/search-routes";

type SearchRoute = { href: string; label: string; group: string; keywords: string; description: string; icon: LucideIcon };

const PAGE_ICONS: Record<string, LucideIcon> = {
  home: Gauge, dashboard: Gauge, accounts: Users, analytics: BarChart3, categories: Tag, drafts: FileText,
  evaluation: Trophy, onboarding: ClipboardList, opportunities: Radar, queue: CalendarClock, settings: Settings2,
  appearance: Settings2, automation: CalendarClock, keys: KeyRound, profile: UserRound, security: ShieldCheck,
  style: PenLine, sources: Globe2, docs: BookOpen, "forgot-password": LockKeyhole, leaderboard: Trophy,
  login: UserRound, market: BarChart3, "no-viral-guarantee": FileText, "open-source": FileKey2,
  privacy: ShieldCheck, "research/xpatla-consumer-complaints-2026": FileText, "reset-password": LockKeyhole,
  signup: UserRound, terms: FileText, transparency: ShieldCheck,
};

const ROUTE_LABELS: Record<string, string> = {
  docs: "Documentation", "forgot-password": "Forgot password", market: "Market",
  "no-viral-guarantee": "No viral guarantee", "open-source": "Open source",
  "research/xpatla-consumer-complaints-2026": "Consumer complaint research",
  "reset-password": "Reset password", signup: "Sign up", transparency: "Transparency",
};

type SearchText = (message: string, params?: Record<string, string | number>) => string;
const englishText: SearchText = (message, params) => Object.entries(params || {}).reduce(
  (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), message,
);

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

export function getSidebarSearchRoutes(locale: Locale, translate?: SearchText): SearchRoute[] {
  const t = translate ?? englishText;
  const { nav, landing } = getDictionary(locale);
  return [...new Set(SEARCH_PAGE_PATHS)].map((href) => {
    const segment = href.split("/").filter(Boolean).at(-1) || "home";
    const dictionary = nav as unknown as Record<string, string>;
    const label = href === "/"
      ? landing.brand
      : href === "/dashboard"
        ? nav.dashboard
        : href === "/settings/keys"
          ? t("AI providers")
          : href === "/onboarding"
            ? t("Setup")
            : href === "/privacy"
              ? landing.privacy
              : href === "/terms"
                ? landing.terms
                : href === "/security"
                  ? landing.security
                  : dictionary[segment] || t(ROUTE_LABELS[href.split("/").filter(Boolean).join("/")] || ROUTE_LABELS[segment] || "Documentation");
    const group = href === "/profile"
      ? nav.profile
      : href.startsWith("/settings/") || href === "/settings"
        ? nav.settings
        : ["/dashboard", "/accounts", "/analytics", "/categories", "/drafts", "/evaluation", "/onboarding", "/opportunities", "/queue", "/sources"].includes(href)
          ? nav.primary
          : t("Pages");
    const icon = PAGE_ICONS[segment] ?? PAGE_ICONS[href.split("/").filter(Boolean).join("/")] ?? FileText;
    return { href, label, group, keywords: `${href.replaceAll("/", " ")} ${SEARCH_TERMS[segment] || ""}`, icon, description: t("Open {label}.", { label }) };
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

export function SidebarSearch({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const router = useRouter();
  const { t } = useUiText();
  const copy = { search: t("Search"), placeholder: t("Search pages and settings…"), description: t("Jump to a workspace page. Use the arrow keys to move and Enter to open."), noResults: t("No matching pages."), close: t("Close search"), navigate: t("Open") };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const routes = useMemo(() => filterSidebarSearchRoutes(getSidebarSearchRoutes(locale, t), query), [locale, query, t]);
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
    <Dialog.Trigger render={<Button variant="outline" className="mx-3 mb-1 h-10 justify-between border-sidebar-border bg-sidebar px-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-keyshortcuts="Meta+K Control+K" />}>
      <span className="flex items-center gap-2 group-data-[collapsible=icon]:gap-0"><Search aria-hidden="true" className="size-4" /><span className="group-data-[collapsible=icon]:sr-only">{copy.search}</span></span><kbd className="rounded border px-1.5 py-0.5 text-[10px] group-data-[collapsible=icon]:hidden">⌘K</kbd>
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
