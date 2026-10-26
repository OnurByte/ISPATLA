"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUiText } from "@/i18n/ui-client";

export function PublishingMethods({ draftId }: { draftId: number }) {
  const { t } = useUiText();
  const [preparation, setPreparation] = useState<{ id: string; url: string | null; handle: string } | null>(null);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function call(method: string, receipt = false) {
    setPending(true); setNotice("");
    try {
      const response = await fetch(`/api/drafts/${draftId}/publishing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(receipt ? { preparationId: preparation?.id, url } : { method }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ? t(body.error) : t("The action could not be completed."));
      if (receipt) setNotice(t("The post was observed through FXTwitter. This is not official publication verification."));
      else { setPreparation(body); setNotice(method === "x_native_schedule" ? t("Complete scheduling on 𝕏. Add the post link here after publication.") : t("Complete sharing on 𝕏, then add the published post link here.")); }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : t("The action could not be completed.")); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-4"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => void call("x_web_intent")}>{t("Share on 𝕏")}</Button><Button variant="outline" disabled={pending} onClick={() => void call("x_native_schedule")}>{t("Schedule on 𝕏")}</Button><Button variant="ghost" disabled={pending} onClick={() => void call("manual_import")}>{t("Add post link")}</Button></div>{preparation && <><p className="text-sm text-muted-foreground">{t("Target account:")} @{preparation.handle}. {t("Check that the correct account is active on 𝕏.")}</p>{preparation.url && <Button nativeButton={false} render={<a href={preparation.url} target="_blank" rel="noreferrer" />}>{t("Open sharing screen")}</Button>}<Field><FieldLabel htmlFor={`receipt-${draftId}`}>{t("Published post link")}</FieldLabel><Input id={`receipt-${draftId}`} value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://x.com/.../status/..." /></Field><Button variant="outline" disabled={pending || !url} onClick={() => void call("", true)}>{t("Check post")}</Button></>}{notice && <Alert role="status"><AlertDescription>{notice}</AlertDescription></Alert>}</div>;
}
