"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BadgeCheck, RefreshCw, Save, Trash2, UserRound } from "lucide-react";
import type { Account, CategoryDefinition } from "@/server/db-types";
import type { InferenceResult } from "@/server/account-inference";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { XConnectButton, XConnectionControls, type XConnectionState } from "@/components/x-connection-controls";

export type AccountPageData = Pick<Account, "id" | "accountKey" | "handle" | "displayName" | "enabled" | "defaultAccount" | "dailyLimit" | "capabilities" | "styleProfile" | "publicVerificationStatus" | "updatedAt">;

type AccountDraft = Pick<AccountPageData, "accountKey" | "handle" | "displayName" | "enabled" | "defaultAccount" | "dailyLimit" | "publicVerificationStatus"> & {
  id?: number;
  capabilities: string[];
  styleProfile: Record<string, unknown>;
};

function accountDraft(account: AccountPageData): AccountDraft {
  return {
    id: account.id,
    accountKey: account.accountKey,
    handle: account.handle,
    displayName: account.displayName,
    enabled: account.enabled,
    defaultAccount: account.defaultAccount,
    dailyLimit: account.dailyLimit,
    capabilities: [...account.capabilities],
    styleProfile: { ...account.styleProfile },
    publicVerificationStatus: account.publicVerificationStatus,
  };
}

function blankAccount(): AccountDraft {
  return {
    accountKey: "",
    handle: "",
    displayName: "",
    enabled: true,
    defaultAccount: false,
    dailyLimit: 24,
    capabilities: ["post"],
    styleProfile: {},
  };
}

function verificationLabel(status: Account["publicVerificationStatus"]): string {
  return ({ blue: "Mavi doğrulama", organization: "Kuruluş doğrulaması", government: "Devlet doğrulaması", not_verified: "Doğrulanmamış", unknown: "Bilinmiyor" })[status || "unknown"];
}

function verificationClass(status: Account["publicVerificationStatus"]): string {
  return status === "blue" ? "text-primary" : status === "organization" ? "text-amber-600" : status === "government" ? "text-indigo-600" : "text-muted-foreground";
}

export function AccountsPage({ initial, categories, connections, policyVersion, copyVersion, connectionResult, connectionAccountId }: {
  initial: AccountPageData[]; categories: CategoryDefinition[];
  connections: Record<number, XConnectionState>; policyVersion: string; copyVersion: string;
  connectionResult?: string; connectionAccountId?: number;
}) {
  const [accounts, setAccounts] = useState(initial);
  const initialSelected = initial.find((account) => account.id === connectionAccountId)
    || (connectionResult === "connected" ? [...initial].sort((left, right) => right.updatedAt - left.updatedAt)[0] : undefined)
    || initial[0];
  const [draft, setDraft] = useState<AccountDraft>(initialSelected ? accountDraft(initialSelected) : blankAccount());
  const [message, setMessage] = useState(connectionResult === "failed" ? "𝕏 bağlantısı tamamlanamadı. İzinleri yeniden deneyin."
    : connectionResult === "connected" && initialSelected ? `@${initialSelected.handle} 𝕏 hesabı bağlandı. Hesap ayarlarınız korundu.` : "");
  const [pending, setPending] = useState(false);
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<number[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<Record<number, number>>({});
  const [manualCategoryId, setManualCategoryId] = useState("");
  const [inferenceMessage, setInferenceMessage] = useState(connectionResult === "connected" ? "Hesap konu önerileri arka planda hazırlanıyor." : "");
  const [inferencePending, setInferencePending] = useState(false);
  const [inferenceAccepted, setInferenceAccepted] = useState(false);

  useEffect(() => {
    if (window.location.search.includes("connection=")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    const account = initialSelected;
    if (connectionResult !== "connected" || !account || draft.id !== account.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/accounts/${account.id}/categories/inference`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
        });
        const result = await response.json().catch(() => ({})) as InferenceResult & { error?: string };
        if (!response.ok) throw new Error(result.error || "Hesap analizi yapılamadı.");
        if (cancelled) return;
        setInference(result);
        const categoryIds = result.suggestions.map((item) => item.categoryId);
        setSelectedSuggestions(categoryIds);
        setCategoryWeights(Object.fromEntries(categoryIds.map((id) => [id, 1])));
        if (categoryIds.length && (!Array.isArray(account.styleProfile.categories) || account.styleProfile.categories.length === 0)) {
          const saved = await fetch(`/api/accounts/${account.id}/categories`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ categoryIds, weights: Object.fromEntries(categoryIds.map((id) => [id, 1])) }),
          });
          const body = await saved.json().catch(() => ({}));
          if (!saved.ok) throw new Error(body.error || "Önerilen kategoriler kaydedilemedi.");
          setInferenceAccepted(true);
        }
        setInferenceMessage("Hesap tarandı; bulunan kategoriler bu hesaba uygulandı.");
      } catch (error) {
        if (!cancelled) setInferenceMessage(error instanceof Error ? error.message : "Hesap analizi yapılamadı.");
      }
    })();
    return () => { cancelled = true; };
  }, [connectionResult, initialSelected, draft.id]);

  useEffect(() => {
    if (!draft.id || (connectionResult === "connected" && draft.id === initialSelected?.id)) return;
    void loadInference(draft.id);
  }, [draft.id, connectionResult, initialSelected?.id]);

  async function loadInference(accountId: number, run = false, regenerate = false) {
    setInferencePending(true); setInferenceMessage("");
    try {
      if (run) {
        const response = await fetch(`/api/accounts/${accountId}/categories/inference`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regenerate }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Hesap analizi yapılamadı.");
        setInference(body as InferenceResult);
        setSelectedSuggestions((body as InferenceResult).suggestions.map((item) => item.categoryId));
        setCategoryWeights(Object.fromEntries((body as InferenceResult).suggestions.map((item) => [item.categoryId, 1])));
      } else {
        const response = await fetch(`/api/accounts/${accountId}/categories/inference`, { cache: "no-store" });
        const body = await response.json().catch(() => null) as { result?: InferenceResult } | null;
        setInference(body?.result || null);
        setSelectedSuggestions(body?.result?.suggestions.map((item) => item.categoryId) || []);
        setCategoryWeights(Object.fromEntries((body?.result?.suggestions || []).map((item) => [item.categoryId, 1])));
      }
    } catch (error) { setInferenceMessage(error instanceof Error ? error.message : "Hesap analizi yapılamadı."); }
    finally { setInferencePending(false); }
  }

  async function acceptSuggestions() {
    if (!draft.id || !inference) return;
    setInferencePending(true); setInferenceMessage("");
    try {
      const response = await fetch(`/api/accounts/${draft.id}/categories`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryIds: selectedSuggestions, weights: categoryWeights }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Konular kaydedilemedi.");
      setInference(null);
      setInferenceAccepted(true);
      const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
      setAccounts(next);
      const saved = next.find((item) => item.id === draft.id);
      if (saved) setDraft(accountDraft(saved));
      setInferenceMessage("Konular ve başlangıç tercihleri kaydedildi. Yayın izinlerin değişmedi.");
    } catch (error) { setInferenceMessage(error instanceof Error ? error.message : "Konular kaydedilemedi."); }
    finally { setInferencePending(false); }
  }

  function moveSuggestion(index: number, direction: -1 | 1) {
    const next = [...selectedSuggestions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedSuggestions(next);
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const suggestedIds = inference?.suggestions.map((item) => item.categoryId) || [];
  const orderedCategoryIds = [...selectedSuggestions, ...suggestedIds.filter((id) => !selectedSuggestions.includes(id))];
  const availableManualCategories = categories.filter((category) => category.enabled && !selectedSuggestions.includes(category.id));

  function select(account: AccountPageData) {
    setDraft(accountDraft(account));
    setInference(null);
    setSelectedSuggestions([]);
    setInferenceAccepted(false);
    setInferenceMessage("");
    setMessage("");
    if (account.id === draft.id) void loadInference(account.id);
  }

  function setValue<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!draft.id) return setMessage("Hesap ayarlarını değiştirmek için önce 𝕏 hesabını bağlayın.");
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/accounts/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Kaydedilemedi");
    const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
    setAccounts(next);
    const saved = next.find((item) => item.id === body.id) || next[0];
    if (saved) select(saved);
    setMessage("Hesap kaydedildi.");
  }

  async function remove() {
    if (!draft.id || !window.confirm("Bu hesabı ve bağlı kayıtlarını silmek, varsa 𝕏 bağlantısını kapatmak istiyor musunuz?")) return;
    setPending(true);
    const response = await fetch(`/api/accounts/${draft.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Hesap silinemedi.");
    const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
    setAccounts(next);
    setDraft(next[0] ? accountDraft(next[0]) : blankAccount());
    setMessage(body.disconnected === true && body.providerRevoked === false
      ? "Hesap silindi ve yerel erişim kapatıldı. 𝕏 erişimi iptal edilemedi; 𝕏 ayarlarından İSPATLA erişimini kaldırın."
      : body.disconnected === true ? "Hesap silindi ve 𝕏 bağlantısı kapatıldı." : "Hesap silindi.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Hesap listesi</CardTitle>
            <CardDescription>Yayın ve stil bağlamı burada tutulur.</CardDescription>
          </div>
          <XConnectButton size="sm" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accounts.length === 0 && (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>Henüz 𝕏 hesabı bağlı değil</EmptyTitle>
                <EmptyDescription>𝕏’e güvenli biçimde bağlayınca hesap ayarları burada açılır.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {accounts.map((account) => {
            const selected = draft.id === account.id;
            return (
              <Button
                key={account.id}
                type="button"
                variant={selected ? "secondary" : "ghost"}
                className="h-auto min-h-14 justify-start gap-3 border border-transparent p-3 text-left data-[selected=true]:border-primary"
                data-selected={selected}
                onClick={() => select(account)}
              >
                <Avatar size="default">
                  <AvatarFallback>
                    <UserRound aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="flex w-full items-center gap-1 truncate text-sm font-medium">@{account.handle}{account.publicVerificationStatus && account.publicVerificationStatus !== "not_verified" && account.publicVerificationStatus !== "unknown" ? <BadgeCheck className={verificationClass(account.publicVerificationStatus)} aria-label={verificationLabel(account.publicVerificationStatus)} /> : null}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{account.displayName || account.accountKey}</span>
                  {Array.isArray(account.styleProfile.categories) && account.styleProfile.categories.length ? <span className="w-full truncate text-xs text-muted-foreground">{account.styleProfile.categories.map(String).join(" · ")}</span> : null}
                </span>
                {account.defaultAccount && <Badge variant="secondary">default</Badge>}
                <Badge variant={account.enabled ? "default" : "outline"}>{account.enabled ? "aktif" : "pasif"}</Badge>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hesap ayarları</CardTitle>
          <CardDescription>Hesap profili 𝕏 bağlantısından gelir. Buradaki editoryal tercihleri bağlantıyı yenilerken koruruz.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!draft.id ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Hesap ayarları açılmadı</EmptyTitle><EmptyDescription>İlk 𝕏 hesabını bağladığınızda editoryal ayarlar burada görünür.</EmptyDescription></EmptyHeader></Empty> : (
          <>
          <XConnectionControls accountId={draft.id} initial={connections[draft.id] || null} policyVersion={policyVersion} copyVersion={copyVersion} />
          <Separator />
          {inference || inferenceMessage ? <Card>
            <CardHeader><CardTitle>Senin için hazırladığımız konular</CardTitle><CardDescription>Öneriler hesap adından, kendi herkese açık gönderilerinden ve varsa yazdığın nişten çıkarılır. 𝕏 bağlantısı yayın izni vermez.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {inference?.status === "insufficient_evidence" ? <p className="text-sm text-muted-foreground">Yeterli konu sinyali bulamadık. Hesap nişini aşağıdaki alana kendin yazabilirsin.</p> : null}
              {inference?.status === "ready" && inference.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">Bekleyen öneri kalmadı. İstersen hesabını yeniden analiz edebilirsin.</p> : null}
              {orderedCategoryIds.map((categoryId) => {
                const suggestion = inference?.suggestions.find((item) => item.categoryId === categoryId);
                const category = categoryById.get(categoryId);
                if (!category) return null;
                const selectedIndex = selectedSuggestions.indexOf(categoryId);
                return <div key={categoryId} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <input aria-label={`${category.name} önerisini seç`} type="checkbox" checked={selectedIndex >= 0} onChange={(event) => setSelectedSuggestions((current) => event.target.checked ? [...current, categoryId] : current.filter((id) => id !== categoryId))} />
                  <div className="min-w-0 flex-1"><p className="font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{suggestion ? `Eşleşen ifadeler: ${suggestion.evidence.join(", ")} · Eşleşme gücü %${Math.round(suggestion.confidence * 100)}` : "Senin eklediğin konu"}</p></div>
                  {selectedIndex >= 0 ? <><label className="flex items-center gap-2 text-xs">Ağırlık <input type="range" min="0" max="10" step="0.5" value={categoryWeights[categoryId] ?? 1} onChange={(event) => setCategoryWeights((current) => ({ ...current, [categoryId]: Number(event.target.value) }))} aria-label={`${category.name} ağırlığı`} /></label><Button type="button" size="icon" variant="ghost" aria-label={`${category.name} yukarı taşı`} disabled={selectedIndex === 0} onClick={() => moveSuggestion(selectedIndex, -1)}><ArrowUp aria-hidden="true" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`${category.name} aşağı taşı`} disabled={selectedIndex === selectedSuggestions.length - 1} onClick={() => moveSuggestion(selectedIndex, 1)}><ArrowDown aria-hidden="true" /></Button></> : null}
                </div>;
              })}
              {availableManualCategories.length ? <div className="flex gap-2"><select value={manualCategoryId} onChange={(event) => setManualCategoryId(event.target.value)} aria-label="Başka konu ekle" className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"><option value="">Başka konu ekle</option>{availableManualCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button type="button" variant="outline" disabled={!manualCategoryId} onClick={() => { const id = Number(manualCategoryId); setSelectedSuggestions((current) => [...current, id]); setCategoryWeights((current) => ({ ...current, [id]: 1 })); setManualCategoryId(""); }}>Ekle</Button></div> : null}
              {inference?.contentLanguage && inference.contentLanguage !== "unknown" ? <p className="text-sm text-muted-foreground">İçerik dili önerisi: {inference.contentLanguage}</p> : null}
              {draft.id && <div className="flex flex-wrap gap-2">{inference && (inference.suggestions.length > 0 || selectedSuggestions.length > 0) ? <Button type="button" onClick={acceptSuggestions} disabled={inferencePending}><Save data-icon="inline-start" aria-hidden="true" /> Konularımı kullan</Button> : null}<Button type="button" variant="outline" onClick={() => void loadInference(draft.id!, true, true)} disabled={inferencePending}><RefreshCw data-icon="inline-start" aria-hidden="true" /> Yeniden öner</Button></div>}
              {inferenceMessage ? <p role="status" className="text-sm text-muted-foreground">{inferenceMessage}</p> : null}
              {inferenceAccepted ? <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/opportunities">İlk fırsatını gör</Link> : null}
            </CardContent>
          </Card> : null}
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">@{draft.handle}</Badge><span className="text-muted-foreground">{draft.displayName}</span></div>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="daily-limit">Günlük yayın limiti</FieldLabel>
                <Input id="daily-limit" type="number" min={1} max={100} value={draft.dailyLimit} onChange={(event) => setValue("dailyLimit", Number(event.target.value))} />
              </Field>
              <p className="self-end text-sm text-muted-foreground">Otomatik yayın şu anda kapalı. Eylem bazlı izinleri aşağıdan yönetin.</p>
            </div>
          </FieldGroup>

          <Separator />

          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="account-enabled">Hesap aktif</FieldLabel>
                <FieldDescription>Bu hesap intake ve yayın akışlarında kullanılabilir.</FieldDescription>
              </FieldContent>
              <Switch id="account-enabled" checked={draft.enabled} onCheckedChange={(value) => setValue("enabled", value)} />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="default-account">Varsayılan hesap</FieldLabel>
                <FieldDescription>Market ve draft ekranlarında ilk seçilecek hesap.</FieldDescription>
              </FieldContent>
              <Switch id="default-account" checked={draft.defaultAccount} onCheckedChange={(value) => setValue("defaultAccount", value)} />
            </Field>
          </FieldGroup>

          <Separator />

          <Field>
            <FieldLabel htmlFor="style-notes">Stil notu</FieldLabel>
            <Input id="style-notes" value={String(draft.styleProfile.tone || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, tone: event.target.value })} placeholder="sade, kanıt odaklı, kısa" />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-niche">Hesap nişi</FieldLabel>
            <FieldDescription>Bu yayın hesabının konusu; her hesap ayrı niş kullanır.</FieldDescription>
            <Input id="account-niche" value={String(draft.styleProfile.niche || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, niche: event.target.value })} placeholder="ör. teknoloji ve girişimcilik" />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-categories">Hesap kategorileri</FieldLabel>
            <FieldDescription>Katalogdan bir veya daha fazla kategori seç. Otomatik yayın yalnız eşleşen hesaplara yönlendirilir.</FieldDescription>
            <select id="account-categories" multiple value={(Array.isArray(draft.styleProfile.categories) ? draft.styleProfile.categories.map(String) : []).filter((value) => categories.some((category) => category.slug === value))} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, categories: Array.from(event.currentTarget.selectedOptions).map((option) => option.value).slice(0, 12) })} className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm">
              {categories.filter((category) => category.enabled).map((category) => <option key={category.id} value={category.slug}>{category.name} ({category.slug})</option>)}
            </select>
          </Field>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="account-opening">Giriş biçimi</FieldLabel>
                <Input id="account-opening" value={String(draft.styleProfile.opening || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, opening: event.target.value })} placeholder="Emoji ile başla / doğrudan başlık / soru" />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-emoji">Emoji kuralı</FieldLabel>
                <Input id="account-emoji" value={String(draft.styleProfile.emoji || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, emoji: event.target.value })} placeholder="⚡️ yalnız son dakika; yoksa kullanma" />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-attribution">Kaynak atfı</FieldLabel>
            <Input id="account-attribution" value={String(draft.styleProfile.attribution || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, attribution: event.target.value })} placeholder="Gerçek kaynak varsa sonda (Kurum adı); yoksa yazma" />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-format">Cümle ve format kuralı</FieldLabel>
                <Input id="account-format" value={String(draft.styleProfile.formatRule || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, formatRule: event.target.value })} placeholder="tek paragraf, kısa cümle, hashtag yok" />
              </Field>
            </div>
          </FieldGroup>

          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" />} Ayarları kaydet
            </Button>
            {(
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />} Sil
              </Button>
            )}
            {(
              <Badge variant="outline" className="gap-1">
                ayarlar bağlı 𝕏 hesabına ait
              </Badge>
            )}
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
