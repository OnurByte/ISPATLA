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
import { localizePath, stripLocalePrefix, type Locale } from "@/i18n/config";
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

function XBrandIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l7.3-8.4L1.8 2h6.5l4.4 6.9L18.9 2Zm-1.1 17.9h1.7L7.3 4H5.5l12.3 15.9Z" /></svg>;
}

export function AppShell({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const pathname = usePathname();
  const dict = getDictionary(locale);
  const routePathname = stripLocalePrefix(pathname);
  const primaryNav: NavItem[] = [
    { href: "/dashboard", label: dict.nav.dashboard, icon: Gauge },
    { href: "/opportunities", label: dict.nav.opportunities, icon: Sparkles },
    { href: "/drafts", label: dict.nav.drafts, icon: FileKey2, children: [{ href: "/queue", label: dict.nav.queue, icon: FileKey2 }] },
    { href: "/leaderboard", label: dict.nav.leaderboard, icon: Trophy },
  ];
  const operationsNav: NavItem[] = [
    { href: "/accounts", label: dict.nav.accounts, icon: Users, children: [{ href: "/sources", label: dict.nav.sources, icon: Users }, { href: "/categories", label: dict.nav.categories, icon: Sparkles }] },
    { href: "/analytics", label: dict.nav.analytics, icon: BarChart3, children: [{ href: "/evaluation", label: dict.nav.evaluation, icon: Trophy }] },
  ];
  const settingsNav: NavItem[] = [{ href: "/settings", label: dict.nav.settings, icon: Settings2, children: [
    { href: "/settings/appearance", label: dict.nav.appearance, icon: Settings2 },
    { href: "/settings/style", label: dict.nav.style, icon: Sparkles },
    { href: "/settings/security", label: dict.nav.security, icon: FileKey2 },
    { href: "/settings/keys", label: dict.nav.keys, icon: FileKey2 },
    { href: "/settings/automation", label: dict.nav.automation, icon: Gauge },
  ] }];
  const localized = (items: NavItem[]) => items.map((item) => ({ ...item, href: localizePath(locale, item.href), children: item.children?.map((child) => ({ ...child, href: localizePath(locale, child.href) })) }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex-row items-center justify-between gap-2 p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5">
          <BrandLogo href={localizePath(locale, "/dashboard")} className="group-data-[collapsible=icon]:hidden" />
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={isSidebarRouteActive(routePathname, "/profile")} tooltip={dict.nav.profile} render={<Link href={localizePath(locale, "/profile")} />}>
                <XBrandIcon />
                <span>{dict.nav.profile}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger aria-label={dict.nav.menuOpen} />
          <BrandLogo href={localizePath(locale, "/dashboard")} />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
