"use client";

import { useState } from "react";
import { socialShareTargets } from "@/lib/social-sharing";
import { socialCopy } from "@/i18n/social-copy";
import type { Locale } from "@/i18n/config";

export function ShareActions({ url, text, imageUrl, locale }: { url: string; text: string; imageUrl?: string; locale: Locale }) {
  const words = socialCopy[locale];
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  const style = "inline-flex min-h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted";
  return <div className="flex flex-wrap items-center gap-2" aria-label={words.options}>
    {socialShareTargets(url, text).map(item =>
      <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={style}>{item.label}</a>
    )}
    <button type="button" onClick={() => void copy()} className={style}>
      {copyStatus === "success" ? words.copied : words.copyLink}
    </button>
    {imageUrl && <a href={imageUrl} download="ispatla-kanit.png" className={style}>{words.image}</a>}
    <span role="status" aria-live="polite" className="sr-only">
      {copyStatus === "error" ? words.copyError : copyStatus === "success" ? words.copied : ""}
    </span>
  </div>;
}
