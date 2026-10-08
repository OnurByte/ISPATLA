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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  { href: "/app", label: "Kontrol merkezi", icon: Gauge },
  { href: "/app/opportunities", label: "Fırsatlar", icon: Sparkles },
  { href: "/app/drafts", label: "Draft stüdyosu", icon: FileKey2 },
  { href: "/app/queue", label: "Yayın kuyruğu", icon: Inbox },
];

const operationsNav: NavItem[] = [
  { href: "/app/accounts", label: "Hesaplar", icon: Users },
  { href: "/app/developer/x", label: "X timeline", icon: Search },
  { href: "/app/sources", label: "Kaynaklar", icon: ListFilter },
  { href: "/app/categories", label: "Kategoriler", icon: Tags },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/evaluation", label: "Karar değerlendirmesi", icon: ListFilter },
];

const settingsNav: NavItem[] = [
  { href: "/app/settings/keys", label: "Key yönetimi", icon: KeyRound },
  { href: "/app/settings/automation", label: "Otomasyon", icon: Bot },
  { href: "/app/settings/style", label: "Stil profili", icon: Settings2 },
];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Oturum kapatılamadı. Yeniden dene.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Oturum kapatılamadı. Yeniden dene.");
    } finally {
      setPending(false);
    }
  }

  return <div className="space-y-1">
    <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => void signOut()} disabled={pending}>
      <LogOut data-icon="inline-start" aria-hidden="true" />{pending ? "Çıkış yapılıyor…" : "Çıkış yap"}
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
              <span className="truncate text-xs text-sidebar-foreground/60">Araştırma ve yayın masası</span>
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
          <SignOutButton />
          <p className="px-2 pb-1 text-xs leading-5 text-sidebar-foreground/50">
            Kaynak → fırsat → draft → resmi X API → doğrulama
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
