"use client";

import { ACCENT_COLORS, useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import type { Locale } from "@/i18n/config";

export function AppearanceSettings({ locale }: { locale: Locale }) {
  const { theme, setTheme, motion, setMotion, accent, setAccent, storageAvailable } = useTheme();
  return <Card>
    <CardHeader><CardTitle>Dil ve görünüm</CardTitle><CardDescription>Değişiklikler hemen uygulanır ve bu tarayıcıda hatırlanır. Diğer cihazlarına aktarılmaz.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2"><h2 className="text-sm font-medium">Arayüz dili</h2><LocaleSwitcher locale={locale} /><p className="text-sm text-muted-foreground">Bu seçim taslakların dilini değiştirmez. İçerik dilini hesap tercihlerinden ayarlayabilirsin.</p></div>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Tema</legend><div className="flex flex-wrap gap-3">{([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm"><input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />{label}</label>)}</div><p className="text-sm text-muted-foreground">Sistem seçeneği cihazının açık veya koyu görünüm tercihini izler.</p></fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Vurgu rengi</legend><div className="flex flex-wrap gap-2">{ACCENT_COLORS.map((color) => <label key={color} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm capitalize focus-within:ring-2 focus-within:ring-ring"><input className="sr-only" type="radio" name="accent" value={color} checked={accent === color} onChange={() => setAccent(color)} /><span aria-hidden="true" className="size-4 rounded-full" style={{ backgroundColor: `var(--swatch-${color})` }} />{({ blue: "Mavi", green: "Yeşil", orange: "Turuncu", violet: "Mor", rose: "Gül" } as const)[color]}</label>)}</div><p className="text-sm text-muted-foreground">Seçimin arayüz vurgularına, marka gradyanına ve site simgesine uygulanır; bu tarayıcıda saklanır.</p></fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">Hareket azaltma</legend><div className="flex flex-wrap gap-3">{([['system', 'Sistem'], ['reduce', 'Her zaman azalt']] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm"><input type="radio" name="motion" value={value} checked={motion === value} onChange={() => setMotion(value)} />{label}</label>)}</div><p className="text-sm text-muted-foreground">Cihazında hareket azaltma açıksa her iki seçenek de bunu korur. Her zaman azalt, animasyonları ve yumuşak kaydırmayı bu tarayıcıda ayrıca azaltır.</p></fieldset>
      <p className="text-sm text-muted-foreground">Tüm kontrolleri klavyedeki Tab ve ok tuşlarıyla kullanabilirsin. Metni büyütmek için tarayıcının yakınlaştırma ayarını kullan.</p>
      {!storageAvailable && <p role="status" className="text-sm text-muted-foreground">Tarayıcı depolaması kapalı. Görünüm tercihin bu sayfada uygulanır, sayfayı yeniden açınca sıfırlanabilir.</p>}
    </CardContent>
  </Card>;
}
