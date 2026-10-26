"use client";

import { ACCENT_COLORS, useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import type { Locale } from "@/i18n/config";
import { useUiText } from "@/i18n/ui-client";

export function AppearanceSettings({ locale }: { locale: Locale }) {
  const { t } = useUiText();
  const { theme, setTheme, motion, setMotion, accent, setAccent, storageAvailable } = useTheme();
  return <Card>
    <CardHeader><CardTitle>{t("Language and appearance")}</CardTitle><CardDescription>{t("Changes apply immediately and are remembered in this browser. They are not synced to your other devices.")}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2"><h2 className="text-sm font-medium">{t("Interface language")}</h2><LocaleSwitcher locale={locale} /><p className="text-sm text-muted-foreground">{t("This setting does not change the language of your drafts. You can set the content language in your account preferences.")}</p></div>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">{t("Theme")}</legend><div className="flex flex-wrap gap-3">{([['system', t("System")], ['light', t("Light")], ['dark', t("Dark")]] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm"><input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />{label}</label>)}</div><p className="text-sm text-muted-foreground">{t("System follows your device’s light or dark appearance preference.")}</p></fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">{t("Accent color")}</legend><div className="flex flex-wrap gap-2">{ACCENT_COLORS.map((color) => <label key={color} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm capitalize focus-within:ring-2 focus-within:ring-ring"><input className="sr-only" type="radio" name="accent" value={color} checked={accent === color} onChange={() => setAccent(color)} /><span aria-hidden="true" className="size-4 rounded-full" style={{ backgroundColor: `var(--swatch-${color})` }} />{t(({ blue: "Blue", green: "Green", orange: "Orange", violet: "Violet", rose: "Rose" } as const)[color])}</label>)}</div><p className="text-sm text-muted-foreground">{t("Your choice is applied to interface accents, the brand gradient, and the site icon, and is stored in this browser.")}</p></fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">{t("Reduce motion")}</legend><div className="flex flex-wrap gap-3">{([['system', t("System")], ['reduce', t("Always reduce")]] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm"><input type="radio" name="motion" value={value} checked={motion === value} onChange={() => setMotion(value)} />{label}</label>)}</div><p className="text-sm text-muted-foreground">{t("If your device has reduced motion enabled, both options respect it. Always reduce also reduces animation and smooth scrolling in this browser.")}</p></fieldset>
      <p className="text-sm text-muted-foreground">{t("Use Tab and the arrow keys to navigate all controls. Use your browser’s zoom setting to enlarge text.")}</p>
      {!storageAvailable && <p role="status" className="text-sm text-muted-foreground">{t("Browser storage is disabled. Your appearance preference applies on this page and may reset when you reopen it.")}</p>}
    </CardContent>
  </Card>;
}
