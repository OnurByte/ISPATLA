"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  FileKey2,
  Gauge,
  Settings2,
  Sparkles,
  Users,
  LogOut,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { SidebarSearch } from "@/components/sidebar-search";
import { DEFAULT_LOCALE, localeFromPath, localizePath, stripLocalePrefix, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type NavItem = { href: string; label: string; icon: LucideIcon };

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SignOutButton({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(dict.nav.signOutError);
      router.replace(localizePath(locale, "/"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : dict.nav.signOutError);
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-1">
    <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => void signOut()} disabled={pending}>
      <LogOut data-icon="inline-start" aria-hidden="true" />{pending ? dict.nav.signOutPending : dict.nav.signOut}
    </Button>
    {error && <p className="px-2 text-xs text-destructive" role="alert">{error}</p>}
  </div>;
}

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                isActive={isActive(stripLocalePrefix(pathname), stripLocalePrefix(href))}
                tooltip={label}
                className="group/nav-item"
                render={<Link href={href} />}
              >
                <Icon aria-hidden="true" className="transition-transform duration-150 group-hover/nav-item:-translate-y-0.5 group-active/nav-item:scale-95 motion-reduce:transition-none" />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = localeFromPath(pathname) ?? DEFAULT_LOCALE;
  const dict = getDictionary(locale);
  const routePathname = stripLocalePrefix(pathname);
  const contentTabs = [{ href: "/app/drafts", label: dict.nav.drafts }, { href: "/app/queue", label: dict.nav.queue }];
  const accountTabs = [{ href: "/app/accounts", label: dict.nav.accounts }, { href: "/app/sources", label: dict.nav.sources }, { href: "/app/categories", label: dict.nav.categories }];
  const insightTabs = [{ href: "/app/analytics", label: dict.nav.analytics }, { href: "/app/evaluation", label: dict.nav.evaluation }];
  const contextualTabs = [contentTabs, accountTabs, insightTabs].find((tabs) => tabs.some((tab) => isActive(routePathname, tab.href)));
  const navPathname = contextualTabs?.[0].href || routePathname;
  const primaryNav: NavItem[] = [
    { href: "/app", label: dict.nav.dashboard, icon: Gauge },
    { href: "/app/opportunities", label: dict.nav.opportunities, icon: Sparkles },
    { href: "/app/drafts", label: dict.nav.drafts, icon: FileKey2 },
    { href: "/leaderboard", label: dict.nav.leaderboard, icon: Trophy },
  ];
  const operationsNav: NavItem[] = [
    { href: "/app/accounts", label: dict.nav.accounts, icon: Users },
    { href: "/app/analytics", label: dict.nav.analytics, icon: BarChart3 },
  ];
  const settingsNav: NavItem[] = [{ href: "/app/settings", label: dict.nav.settings, icon: Settings2 }];
  const localized = (items: NavItem[]) => items.map((item) => ({ ...item, href: localizePath(locale, item.href) }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-3 p-4">
          <div dir="ltr" className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <BrandLogo href={localizePath(locale, "/")} />
              <span dir="auto" className="truncate text-xs text-sidebar-foreground/60">{dict.nav.shellDescription}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarSearch locale={locale} />
          <NavGroup title={dict.nav.primary} items={localized(primaryNav)} pathname={navPathname} />
          <NavGroup title={dict.nav.operations} items={localized(operationsNav)} pathname={navPathname} />
        </SidebarContent>

        <SidebarFooter className="gap-3 p-3">
          <SidebarSeparator />
          <NavGroup title={dict.nav.settings} items={localized(settingsNav)} pathname={routePathname} />
          <p className="px-2 pb-1 text-xs leading-5 text-sidebar-foreground/50">
            Kaynak → fırsat → draft → resmi 𝕏 API → doğrulama
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={dict.nav.menuOpen} />
          <BrandLogo href={localizePath(locale, "/")} />
        </header>
        {contextualTabs && <nav aria-label={contextualTabs[0].label} className="flex flex-wrap gap-1 border-b px-4 py-2 sm:px-6">{contextualTabs.map(({ href, label }) => <Link key={href} href={localizePath(locale, href)} aria-current={isActive(routePathname, href) ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${isActive(routePathname, href) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent"}`}>{label}</Link>)}</nav>}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
