"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Bot,
  FileKey2,
  Gauge,
  Inbox,
  KeyRound,
  ListFilter,
  Tags,
  Settings2,
  Sparkles,
  Users,
  Search,
  LogOut,
  ShieldCheck,
  UserRound,
  Palette,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { BrandLogo } from "@/components/brand-logo";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
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

function SignOutButton({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
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
                render={<Link href={href} />}
              >
                <Icon aria-hidden="true" />
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
  const primaryNav: NavItem[] = [
    { href: "/app", label: dict.nav.dashboard, icon: Gauge },
    { href: "/app/opportunities", label: dict.nav.opportunities, icon: Sparkles },
    { href: "/app/drafts", label: dict.nav.drafts, icon: FileKey2 },
    { href: "/app/queue", label: dict.nav.queue, icon: Inbox },
    { href: "/leaderboard", label: dict.nav.leaderboard, icon: Trophy },
  ];
  const operationsNav: NavItem[] = [
    { href: "/app/accounts", label: dict.nav.accounts, icon: Users },
    { href: "/app/developer/x", label: dict.nav.timeline, icon: Search },
    { href: "/app/sources", label: dict.nav.sources, icon: ListFilter },
    { href: "/app/categories", label: dict.nav.categories, icon: Tags },
    { href: "/app/analytics", label: dict.nav.analytics, icon: BarChart3 },
    { href: "/app/evaluation", label: dict.nav.evaluation, icon: ListFilter },
  ];
  const settingsNav: NavItem[] = [
    { href: "/app/settings/keys", label: dict.nav.keys, icon: KeyRound },
    { href: "/app/settings/automation", label: dict.nav.automation, icon: Bot },
    { href: "/app/settings/style", label: dict.nav.style, icon: Settings2 },
    { href: "/app/settings/profile", label: dict.nav.profile, icon: UserRound },
    { href: "/app/settings/security", label: dict.nav.security, icon: ShieldCheck },
    { href: "/app/settings/appearance", label: dict.nav.appearance, icon: Palette },
  ];
  const localized = (items: NavItem[]) => items.map((item) => ({ ...item, href: localizePath(locale, item.href) }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-3 p-4">
          <div dir="ltr" className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <BrandLogo />
              <span dir="auto" className="truncate text-xs text-sidebar-foreground/60">{dict.nav.shellDescription}</span>
            </div>
            <ModeToggle />
          </div>
          <LocaleSwitcher locale={locale} className="px-1" />
        </SidebarHeader>

        <SidebarContent>
          <NavGroup title={dict.nav.primary} items={localized(primaryNav)} pathname={routePathname} />
          <NavGroup title={dict.nav.operations} items={localized(operationsNav)} pathname={routePathname} />
        </SidebarContent>

        <SidebarFooter className="gap-3 p-3">
          <SidebarSeparator />
          <NavGroup title={dict.nav.settings} items={localized(settingsNav)} pathname={routePathname} />
          <SignOutButton locale={locale} />
          <p className="px-2 pb-1 text-xs leading-5 text-sidebar-foreground/50">
            Kaynak → fırsat → draft → resmi X API → doğrulama
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={dict.nav.menuOpen} />
          <BrandLogo />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
