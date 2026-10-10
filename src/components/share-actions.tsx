"use client";

import { useState } from "react";
import { socialShareTargets } from "@/lib/social-sharing";

export function ShareActions({ url, text, imageUrl }: { url: string; text: string; imageUrl?: string }) {
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
  return <div className="flex flex-wrap items-center gap-2" aria-label="Paylaşım seçenekleri">
    {socialShareTargets(url, text).map(item =>
      <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={style}>{item.label}</a>
    )}
    <button type="button" onClick={() => void copy()} className={style}>
      {copyStatus === "success" ? "Kopyalandı" : "Bağlantıyı kopyala"}
    </button>
    {imageUrl && <a href={imageUrl} download="ispatla-kanit.png" className={style}>Kart görseli</a>}
    <span role="status" aria-live="polite" className="sr-only">
      {copyStatus === "error" ? "Pano erişimi sağlanamadı. Bağlantıyı adres çubuğundan kopyalayın." : copyStatus === "success" ? "Bağlantı kopyalandı." : ""}
    </span>
  </div>;
}
