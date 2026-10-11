"use client";
import { useState } from "react";
import { DEFAULT_LOCALE, localeFromPath } from "@/i18n/config";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PublishingMethods({ draftId }: { draftId: number }) {
  const locale = localeFromPath(usePathname()) ?? DEFAULT_LOCALE;
  const t = (tr: string, en: string) => locale === "tr" ? tr : en;
  const [preparation, setPreparation] = useState<{ id: string; url: string | null; handle: string } | null>(null);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function call(method: string, receipt = false) {
    setPending(true); setNotice("");
    try {
      const response = await fetch(`/api/drafts/${draftId}/publishing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(receipt ? { preparationId: preparation?.id, url } : { method }) });
      const body = await response.json();
      if (!response.ok) throw new Error((locale === "tr" && body.error) || t("İşlem tamamlanamadı.", "The action could not be completed."));
      if (receipt) setNotice(t("Gönderi FXTwitter kaynağında gözlendi. Resmî yayın doğrulaması değildir.", "The post was observed through FXTwitter. This is not official publication verification."));
      else { setPreparation(body); setNotice(method === "x_native_schedule" ? t("Zamanlamayı 𝕏 ekranında tamamlayın. Yayın gerçekleştiğinde bağlantısını buraya ekleyin.", "Complete scheduling on 𝕏. Add the post link here after publication.") : t("Paylaşımı 𝕏 ekranında tamamlayın; yayın bağlantısını buraya ekleyin.", "Complete sharing on 𝕏, then add the published post link here.")); }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : t("İşlem tamamlanamadı.", "The action could not be completed.")); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-4"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => void call("x_web_intent")}>{t("𝕏’te paylaş", "Share on 𝕏")}</Button><Button variant="outline" disabled={pending} onClick={() => void call("x_native_schedule")}>{t("𝕏’te zamanla", "Schedule on 𝕏")}</Button><Button variant="ghost" disabled={pending} onClick={() => void call("manual_import")}>{t("Bağlantı ekle", "Add post link")}</Button></div>{preparation && <><p className="text-sm text-muted-foreground">{t("Hedef hesap:", "Target account:")} @{preparation.handle}. {t("𝕏’te doğru hesabın açık olduğunu kontrol edin.", "Check that the correct account is active on 𝕏.")}</p>{preparation.url && <Button nativeButton={false} render={<a href={preparation.url} target="_blank" rel="noreferrer" />}>{t("Paylaşım ekranını aç", "Open sharing screen")}</Button>}<Field><FieldLabel htmlFor={`receipt-${draftId}`}>{t("Yayınlanan gönderinin bağlantısı", "Published post link")}</FieldLabel><Input id={`receipt-${draftId}`} value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://x.com/.../status/..." /></Field><Button variant="outline" disabled={pending || !url} onClick={() => void call("", true)}>{t("Gönderiyi kontrol et", "Check post")}</Button></>}{notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}</div>;
}
