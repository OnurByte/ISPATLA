"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ModeToggle } from "@/components/mode-toggle";
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

const primaryNav: NavItem[] = [
  { href: "/", label: "Kontrol merkezi", icon: Gauge },
  { href: "/opportunities", label: "Fırsatlar", icon: Sparkles },
  { href: "/drafts", label: "Draft stüdyosu", icon: FileKey2 },
  { href: "/queue", label: "Yayın kuyruğu", icon: Inbox },
];

const operationsNav: NavItem[] = [
  { href: "/accounts", label: "Hesaplar", icon: Users },
  { href: "/x", label: "X İnceleme", icon: Search },
  { href: "/sources", label: "Kaynaklar", icon: ListFilter },
  { href: "/categories", label: "Kategoriler", icon: Tags },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const settingsNav: NavItem[] = [
  { href: "/settings/keys", label: "Key yönetimi", icon: KeyRound },
  { href: "/settings/automation", label: "Otomasyon", icon: Bot },
  { href: "/settings/style", label: "Stil profili", icon: Settings2 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                isActive={isActive(pathname, href)}
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

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback>İ</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold tracking-tight">Ispatla</span>
              <span className="truncate text-xs text-sidebar-foreground/60">X intelligence desk</span>
            </div>
            <ModeToggle />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <NavGroup title="Üretim" items={primaryNav} pathname={pathname} />
          <NavGroup title="Operasyon" items={operationsNav} pathname={pathname} />
        </SidebarContent>

        <SidebarFooter className="gap-3 p-3">
          <SidebarSeparator />
          <NavGroup title="Ayarlar" items={settingsNav} pathname={pathname} />
          <p className="px-2 pb-1 text-xs leading-5 text-sidebar-foreground/50">
            Kaynak → fırsat → draft → x-use → reconciliation
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger aria-label="Menüyü aç" />
          <span className="text-sm font-medium">Ispatla</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
