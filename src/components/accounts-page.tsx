"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Save, Trash2, UserRound } from "lucide-react";
import type { Account, CategoryDefinition } from "@/server/db";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type IdeologyOption = { id: string; name: { en: string; tr: string } };

export function AccountsPage({ initial, ideologies, categories, connections, policyVersion, copyVersion, connectionResult, connectionAccountId }: {
  initial: AccountPageData[]; ideologies: IdeologyOption[]; categories: CategoryDefinition[];
  connections: Record<number, XConnectionState>; policyVersion: string; copyVersion: string;
  connectionResult?: string; connectionAccountId?: number;
}) {
  const [accounts, setAccounts] = useState(initial);
  const initialSelected = initial.find((account) => account.id === connectionAccountId)
    || (connectionResult === "connected" ? [...initial].sort((left, right) => right.updatedAt - left.updatedAt)[0] : undefined)
    || initial[0];
  const [draft, setDraft] = useState<AccountDraft>(initialSelected ? accountDraft(initialSelected) : blankAccount());
  const [message, setMessage] = useState(connectionResult === "failed" ? "X bağlantısı tamamlanamadı. İzinleri yeniden deneyin."
    : connectionResult === "connected" && initialSelected ? `@${initialSelected.handle} X hesabı bağlandı. Hesap ayarlarınız korundu.` : "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (window.location.search.includes("connection=")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  function select(account: AccountPageData) {
    setDraft(accountDraft(account));
    setMessage("");
  }

  function setValue<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!draft.id) return setMessage("Hesap ayarlarını değiştirmek için önce X hesabını bağlayın.");
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
    if (!draft.id || !window.confirm("Bu hesabı ve bağlı kayıtlarını silmek, varsa X bağlantısını kapatmak istiyor musunuz?")) return;
    setPending(true);
    const response = await fetch(`/api/accounts/${draft.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Hesap silinemedi.");
    const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
    setAccounts(next);
    setDraft(next[0] ? accountDraft(next[0]) : blankAccount());
    setMessage(body.disconnected === true && body.providerRevoked === false
      ? "Hesap silindi ve yerel erişim kapatıldı. X erişimi iptal edilemedi; X ayarlarından İSPATLA erişimini kaldırın."
      : body.disconnected === true ? "Hesap silindi ve X bağlantısı kapatıldı." : "Hesap silindi.");
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
                <EmptyTitle>Henüz X hesabı bağlı değil</EmptyTitle>
                <EmptyDescription>X’e güvenli biçimde bağlayınca hesap ayarları burada açılır.</EmptyDescription>
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
          <CardDescription>Hesap profili X bağlantısından gelir. Buradaki editoryal tercihleri bağlantıyı yenilerken koruruz.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!draft.id ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Hesap ayarları açılmadı</EmptyTitle><EmptyDescription>İlk X hesabını bağladığınızda editoryal ayarlar burada görünür.</EmptyDescription></EmptyHeader></Empty> : (
          <>
          <XConnectionControls accountId={draft.id} initial={connections[draft.id] || null} policyVersion={policyVersion} copyVersion={copyVersion} />
          <Separator />
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
                <FieldLabel htmlFor="account-ideology">Editoryal eksen / tandans</FieldLabel>
                <FieldDescription>Açık tandanslı kaynak yalnız aynı eksen veya etiketli hesapla eşleşir; eşleşme yoksa otomatik yayın yapılmaz. Boş hesap sadece tandansı belirsiz kaynak içindir.</FieldDescription>
                <Select value={String(draft.styleProfile.ideology || "belirsiz")} onValueChange={(value) => setValue("styleProfile", { ...draft.styleProfile, ideology: value || "belirsiz" })}>
                  <SelectTrigger id="account-ideology" className="w-full" aria-label="Hesap ideolojisi"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="belirsiz">Belirsiz</SelectItem>{ideologies.map((ideology) => <SelectItem key={ideology.id} value={ideology.id}>{ideology.name.tr || ideology.name.en}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
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
                ayarlar bağlı X hesabına ait
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
