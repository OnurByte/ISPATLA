"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileKey2,
  Gauge,
  Settings2,
  Sparkles,
  Users,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SidebarSearch } from "@/components/sidebar-search";
import { DEFAULT_LOCALE, localeFromPath, localizePath, stripLocalePrefix } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { isSidebarItemActive, isSidebarRouteActive } from "@/lib/sidebar-navigation";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type NavItem = { href: string; label: string; icon: LucideIcon; children?: { href: string; label: string; icon: LucideIcon }[] };

function NavEntry({ href, label, icon: Icon, children = [], pathname }: NavItem & { pathname: string }) {
  const childPaths = children.map((child) => stripLocalePrefix(child.href));
  const active = isSidebarItemActive(stripLocalePrefix(pathname), stripLocalePrefix(href), childPaths);
  const expanded = children.length > 0 && active;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        render={<Link href={href} aria-expanded={children.length ? expanded : undefined} />}
      >
        <Icon aria-hidden="true" className="transition-transform duration-150 group-hover/nav-item:-translate-y-0.5 group-active/nav-item:scale-95 motion-reduce:transition-none" />
        <span>{label}</span>
      </SidebarMenuButton>
      {children.length > 0 && expanded && <SidebarMenuSub>
        {children.map(({ href: childHref, label: childLabel, icon: ChildIcon }) => <SidebarMenuSubItem key={childHref}>
          <SidebarMenuSubButton isActive={isSidebarRouteActive(stripLocalePrefix(pathname), stripLocalePrefix(childHref))} render={<Link href={childHref} />}>
            <ChildIcon aria-hidden="true" />{childLabel}
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>)}
      </SidebarMenuSub>}
    </SidebarMenuItem>
  );
}

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => <NavEntry key={item.href} {...item} pathname={pathname} />)}
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
    { href: "/app/drafts", label: dict.nav.drafts, icon: FileKey2, children: [{ href: "/app/queue", label: dict.nav.queue, icon: FileKey2 }] },
    { href: "/leaderboard", label: dict.nav.leaderboard, icon: Trophy },
  ];
  const operationsNav: NavItem[] = [
    { href: "/app/accounts", label: dict.nav.accounts, icon: Users, children: [{ href: "/app/sources", label: dict.nav.sources, icon: Users }, { href: "/app/categories", label: dict.nav.categories, icon: Sparkles }] },
    { href: "/app/analytics", label: dict.nav.analytics, icon: BarChart3, children: [{ href: "/app/evaluation", label: dict.nav.evaluation, icon: Trophy }] },
  ];
  const settingsNav: NavItem[] = [{ href: "/app/settings", label: dict.nav.settings, icon: Settings2, children: [
    { href: "/app/settings/appearance", label: dict.nav.appearance, icon: Settings2 },
    { href: "/app/settings/style", label: dict.nav.style, icon: Sparkles },
    { href: "/app/settings/profile", label: dict.nav.profile, icon: Users },
    { href: "/app/settings/security", label: dict.nav.security, icon: FileKey2 },
    { href: "/app/settings/keys", label: dict.nav.keys, icon: FileKey2 },
    { href: "/app/settings/automation", label: dict.nav.automation, icon: Gauge },
  ] }];
  const localized = (items: NavItem[]) => items.map((item) => ({ ...item, href: localizePath(locale, item.href), children: item.children?.map((child) => ({ ...child, href: localizePath(locale, child.href) })) }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex-row items-center justify-between gap-2 p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5">
          <BrandLogo href={localizePath(locale, "/")} className="group-data-[collapsible=icon]:hidden" />
          <SidebarTrigger aria-label={dict.nav.menuOpen} className="hidden size-9 md:inline-flex group-data-[collapsible=icon]:inline-flex" />
        </SidebarHeader>

        <SidebarContent>
          <SidebarSearch locale={locale} />
          <NavGroup title={dict.nav.primary} items={localized(primaryNav)} pathname={routePathname} />
          <NavGroup title={dict.nav.operations} items={localized(operationsNav)} pathname={routePathname} />
          <NavGroup title={dict.nav.settings} items={localized(settingsNav)} pathname={routePathname} />
        </SidebarContent>

        <SidebarFooter className="gap-3 p-3">
          <SidebarSeparator />
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
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
