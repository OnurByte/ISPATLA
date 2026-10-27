"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  BarChart3,
  FileKey2,
  Gauge,
  Settings2,
  Radar,
  Tags,
  PenLine,
  Users,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useUiText } from "@/i18n/ui-client";
import { BrandLogo } from "@/components/brand-logo";
import { PublicHeaderContent } from "@/components/public-header-content";
import { SidebarSearch } from "@/components/sidebar-search";
import { LOCALE_CONFIG, localizePath, stripLocalePrefix } from "@/i18n/config";
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
  SidebarMenuAction,
  useSidebar,
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
  const [disclosure, setDisclosure] = useState({ pathname, open: active });
  const expanded = children.length > 0 && (disclosure.pathname === pathname ? disclosure.open : active);
  const childrenId = useId();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        className={children.length ? "min-h-11 pr-12 rtl:pl-12 rtl:pr-2" : "min-h-11"}
        tooltip={label}
        render={<Link href={href} aria-current={isSidebarRouteActive(stripLocalePrefix(pathname), stripLocalePrefix(href)) ? "page" : undefined} />}
      >
        <Icon aria-hidden="true" className="transition-transform duration-150 group-hover/nav-item:-translate-y-0.5 group-active/nav-item:scale-95 motion-reduce:transition-none" />
        <span>{label}</span>
      </SidebarMenuButton>
      {children.length > 0 && <SidebarMenuAction className="top-0! right-0! size-11! rtl:right-auto! rtl:left-0! after:hidden" type="button" aria-label={label} aria-expanded={expanded} aria-controls={expanded ? childrenId : undefined} onClick={() => setDisclosure({ pathname, open: !expanded })}>
        <ChevronDown aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
      </SidebarMenuAction>}
      {children.length > 0 && expanded && <SidebarMenuSub id={childrenId}>
        {children.map(({ href: childHref, label: childLabel, icon: ChildIcon }) => <SidebarMenuSubItem key={childHref}>
          <SidebarMenuSubButton isActive={isSidebarRouteActive(stripLocalePrefix(pathname), stripLocalePrefix(childHref))} render={<Link href={childHref} aria-current={isSidebarRouteActive(stripLocalePrefix(pathname), stripLocalePrefix(childHref)) ? "page" : undefined} />}>
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

function SidebarNavigation({ children }: { children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();
  return <div className="flex h-full min-h-0 flex-col" onClick={(event) => {
    if (event.target instanceof Element && event.target.closest("a[href]")) setOpenMobile(false);
  }}>{children}</div>;
}

function XBrandIcon() {
  return <span aria-hidden="true" className="text-base leading-none">𝕏</span>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {locale} = useUiText();
  const dict = getDictionary(locale);
  const routePathname = stripLocalePrefix(pathname);
  const primaryNav: NavItem[] = [
    { href: "/dashboard", label: dict.nav.dashboard, icon: Gauge },
    { href: "/opportunities", label: dict.nav.opportunities, icon: Radar },
    { href: "/drafts", label: dict.nav.drafts, icon: FileKey2, children: [{ href: "/queue", label: dict.nav.queue, icon: FileKey2 }] },
    { href: "/leaderboard", label: dict.nav.leaderboard, icon: Trophy },
  ];
  const operationsNav: NavItem[] = [
    { href: "/accounts", label: dict.nav.accounts, icon: Users, children: [{ href: "/sources", label: dict.nav.sources, icon: Users }, { href: "/categories", label: dict.nav.categories, icon: Tags }] },
    { href: "/analytics", label: dict.nav.analytics, icon: BarChart3, children: [{ href: "/evaluation", label: dict.nav.evaluation, icon: Trophy }] },
  ];
  const settingsNav: NavItem[] = [{ href: "/settings", label: dict.nav.settings, icon: Settings2, children: [
    { href: "/settings/appearance", label: dict.nav.appearance, icon: Settings2 },
    { href: "/settings/style", label: dict.nav.style, icon: PenLine },
    { href: "/settings/security", label: dict.nav.security, icon: FileKey2 },
    { href: "/settings/keys", label: dict.nav.keys, icon: FileKey2 },
    { href: "/settings/automation", label: dict.nav.automation, icon: Gauge },
  ] }];
  const localized = (items: NavItem[]) => items.map((item) => ({ ...item, href: localizePath(locale, item.href), children: item.children?.map((child) => ({ ...child, href: localizePath(locale, child.href) })) }));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" side={LOCALE_CONFIG[locale].dir === "rtl" ? "right" : "left"}><SidebarNavigation>
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
      </SidebarNavigation></Sidebar>

      <SidebarInset>
        <PublicHeaderContent locale={locale} authenticated leading={<span className="md:hidden"><SidebarTrigger aria-label={dict.nav.menuOpen} /></span>} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
