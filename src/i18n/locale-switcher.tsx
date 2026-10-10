"use client";

import { LOCALES, LOCALE_CONFIG, localizePath, type Locale } from "./config";
import { getDictionary } from "./dictionaries";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LocaleSwitcher({ locale, className = "" }: { locale: Locale; className?: string }) {
  function changeLocale(next: string | null) {
    if (!next || !(LOCALES as readonly string[]).includes(next)) return;
    document.cookie = `ispatla-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    window.location.assign(localizePath(next as Locale, `${window.location.pathname}${window.location.search}${window.location.hash}`));
  }

  const selected = LOCALE_CONFIG[locale];
  return <div className={`inline-flex shrink-0 text-xs ${className}`}>
    <Select value={locale} onValueChange={changeLocale}>
      <SelectTrigger aria-label={getDictionary(locale).nav.language} className="h-9 w-28 max-w-[40vw] rounded-md bg-popover text-popover-foreground sm:w-36">
        <SelectValue className="min-w-0"><span aria-hidden="true" className="shrink-0">{selected.flag}</span><bdi lang={locale} dir={selected.dir} className="truncate">{selected.nativeName}</bdi></SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="min-w-56 max-w-[calc(100vw-1rem)] bg-popover text-popover-foreground" style={{ maxHeight: "min(var(--available-height), 20rem)" }}>
        <SelectGroup>{LOCALES.map((code) => <SelectItem key={code} value={code} label={LOCALE_CONFIG[code].nativeName} className="py-2">
          <span aria-hidden="true">{LOCALE_CONFIG[code].flag}</span><bdi lang={code} dir={LOCALE_CONFIG[code].dir}>{LOCALE_CONFIG[code].nativeName}</bdi>
        </SelectItem>)}</SelectGroup>
      </SelectContent>
    </Select>
  </div>;
}
