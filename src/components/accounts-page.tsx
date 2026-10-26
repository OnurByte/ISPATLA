"use client";
import { BrandText } from "@/components/brand-text";
import { useUiText } from "@/i18n/ui-client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BadgeCheck, RefreshCw, Save, Trash2, UserRound } from "lucide-react";
import type { Account, CategoryDefinition } from "@/server/db-types";
import type { InferenceResult } from "@/server/account-inference";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  return ({ blue: "Blue verified", organization: "Organization verified", government: "Government verified", not_verified: "Not verified", unknown: "Unknown" })[status || "unknown"];
}

function verificationClass(status: Account["publicVerificationStatus"]): string {
  return status === "blue" ? "text-primary" : status === "organization" ? "text-amber-600" : status === "government" ? "text-indigo-600" : "text-muted-foreground";
}

export function AccountsPage({ initial, categories, connections, policyVersion, copyVersion, connectionResult, connectionAccountId }: {
  initial: AccountPageData[]; categories: CategoryDefinition[];
  connections: Record<number, XConnectionState>; policyVersion: string; copyVersion: string;
  connectionResult?: string; connectionAccountId?: number;
}) {
  const { t, locale } = useUiText();
  const number = new Intl.NumberFormat(locale);
  const [accounts, setAccounts] = useState(initial);
  const initialSelected = initial.find((account) => account.id === connectionAccountId)
    || (connectionResult === "connected" ? [...initial].sort((left, right) => right.updatedAt - left.updatedAt)[0] : undefined)
    || initial[0];
  const [draft, setDraft] = useState<AccountDraft>(initialSelected ? accountDraft(initialSelected) : blankAccount());
  const [message, setMessage] = useState(connectionResult === "failed" ? t("𝕏 connection could not be completed. Review permissions and try again.")
    : connectionResult === "connected" && initialSelected ? t("@{handle} 𝕏 account connected. Your account settings were preserved.", { handle: initialSelected.handle }) : "");
  const [pending, setPending] = useState(false);
  const [inference, setInference] = useState<InferenceResult | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<number[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<Record<number, number>>({});
  const [manualCategoryId, setManualCategoryId] = useState("");
  const [inferenceMessage, setInferenceMessage] = useState(connectionResult === "connected" ? t("Preparing account topic suggestions in the background.") : "");
  const [inferencePending, setInferencePending] = useState(false);
  const [inferenceAccepted, setInferenceAccepted] = useState(false);

  const loadInference = useCallback(async (accountId: number, run = false, regenerate = false) => {
    setInferencePending(true); setInferenceMessage("");
    try {
      if (run) {
        const response = await fetch(`/api/accounts/${accountId}/categories/inference`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ regenerate }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(t(body.error || "Could not analyze the account."));
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
    } catch (error) { setInferenceMessage(error instanceof Error ? error.message : t("Could not analyze the account.")); }
    finally { setInferencePending(false); }
  }, [t]);

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
        if (!response.ok) throw new Error(t(result.error || "Could not analyze the account."));
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
          if (!saved.ok) throw new Error(t(body.error || "Could not save suggested categories."));
          setInferenceAccepted(true);
        }
        setInferenceMessage(t("Account scanned. The topics found were applied to this account."));
      } catch (error) {
        if (!cancelled) setInferenceMessage(error instanceof Error ? error.message : t("Could not analyze the account."));
      }
    })();
    return () => { cancelled = true; };
  }, [connectionResult, initialSelected, draft.id, t]);

  useEffect(() => {
    if (!draft.id || (connectionResult === "connected" && draft.id === initialSelected?.id)) return;
    const controller = new AbortController();
    void fetch(`/api/accounts/${draft.id}/categories/inference`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { result?: InferenceResult; error?: string } | null;
        if (!response.ok) throw new Error(t(body?.error || "Could not analyze the account."));
        return body?.result || null;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setInference(result);
        setSelectedSuggestions(result?.suggestions.map((item) => item.categoryId) || []);
        setCategoryWeights(Object.fromEntries((result?.suggestions || []).map((item) => [item.categoryId, 1])));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setInferenceMessage(error instanceof Error ? error.message : t("Could not analyze the account."));
      });
    return () => controller.abort();
  }, [draft.id, connectionResult, initialSelected?.id, t]);

  async function acceptSuggestions() {
    if (!draft.id || !inference) return;
    setInferencePending(true); setInferenceMessage("");
    try {
      const response = await fetch(`/api/accounts/${draft.id}/categories`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryIds: selectedSuggestions, weights: categoryWeights }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t(body.error || "Could not save topics."));
      setInference(null);
      setInferenceAccepted(true);
      const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
      setAccounts(next);
      const saved = next.find((item) => item.id === draft.id);
      if (saved) setDraft(accountDraft(saved));
      setInferenceMessage(t("Topics and initial preferences saved. Your publishing permissions have not changed."));
    } catch (error) { setInferenceMessage(error instanceof Error ? error.message : t("Could not save topics.")); }
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
    if (!draft.id) return setMessage(t("Connect a 𝕏 account before changing its settings."));
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/accounts/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(t(body.error || "Could not save changes."));
    const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
    setAccounts(next);
    const saved = next.find((item) => item.id === body.id) || next[0];
    if (saved) select(saved);
    setMessage(t("Account saved."));
  }

  async function remove() {
    if (!draft.id || !window.confirm(t("Delete this account and its linked records, and disconnect 𝕏 if connected?"))) return;
    setPending(true);
    const response = await fetch(`/api/accounts/${draft.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(t(body.error || "Could not delete account."));
    const next = await fetch("/api/accounts", { cache: "no-store" }).then((item) => item.json() as Promise<AccountPageData[]>);
    setAccounts(next);
    setDraft(next[0] ? accountDraft(next[0]) : blankAccount());
    setMessage(body.disconnected === true && body.providerRevoked === false
      ? t("Account deleted and local access disconnected. 𝕏 access could not be revoked. Remove ispatla.tr access in 𝕏 settings.")
      : body.disconnected === true ? t("Account deleted and 𝕏 disconnected.") : t("Account deleted."));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{t("Account list")}</CardTitle>
            <CardDescription>{t("Publishing and style context are managed here.")}</CardDescription>
          </div>
          <XConnectButton size="sm" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {accounts.length === 0 && (
            <Empty className="border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>{t("No 𝕏 account connected yet")}</EmptyTitle>
                <EmptyDescription>{t("Add a username to prepare categories and writing style automatically.")}</EmptyDescription>
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
                className="h-auto min-h-14 justify-start gap-3 border border-transparent p-3 text-start data-[selected=true]:border-primary"
                data-selected={selected}
                onClick={() => select(account)}
              >
                <Avatar size="default">
                  <AvatarFallback>
                    <UserRound aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="flex w-full items-center gap-1 truncate text-sm font-medium">@{account.handle}{account.publicVerificationStatus && account.publicVerificationStatus !== "not_verified" && account.publicVerificationStatus !== "unknown" ? <BadgeCheck className={verificationClass(account.publicVerificationStatus)} aria-label={t(verificationLabel(account.publicVerificationStatus))} /> : null}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{account.displayName || account.accountKey}</span>
                  {Array.isArray(account.styleProfile.categories) && account.styleProfile.categories.length ? <span className="w-full truncate text-xs text-muted-foreground">{account.styleProfile.categories.map(String).join(" ⁜ ")}</span> : null}
                </span>
                {account.defaultAccount && <Badge variant="secondary">{t("Default")}</Badge>}
                <Badge variant={account.enabled ? "default" : "outline"}>{account.enabled ? t("Active") : t("Inactive")}</Badge>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Account settings")}</CardTitle>
          <CardDescription>{t("Public profile, topic, and writing analysis. Your manually selected preferences are preserved during reanalysis.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!draft.id ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>{t("Account settings are unavailable")}</EmptyTitle><EmptyDescription>{t("Editorial settings appear here after you connect your first 𝕏 account.")}</EmptyDescription></EmptyHeader></Empty> : (
          <>
          <XConnectionControls accountId={draft.id} initial={connections[draft.id] || null} policyVersion={policyVersion} copyVersion={copyVersion} />
          <Separator />
          {inference || inferenceMessage ? <Card>
            <CardHeader><CardTitle>{t("Topics prepared for you")}</CardTitle><CardDescription>{t("Suggestions use the account name, its own public posts, and any niche you entered. Connecting 𝕏 does not grant publishing permission.")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {inference?.status === "insufficient_evidence" ? <p className="text-sm text-muted-foreground">{t("We could not find enough topic signals. You can enter the account niche below.")}</p> : null}
              {inference?.status === "ready" && inference.suggestions.length === 0 ? <p className="text-sm text-muted-foreground">{t("No suggestions are pending. You can analyze the account again if you like.")}</p> : null}
              {orderedCategoryIds.map((categoryId) => {
                const suggestion = inference?.suggestions.find((item) => item.categoryId === categoryId);
                const category = categoryById.get(categoryId);
                if (!category) return null;
                const selectedIndex = selectedSuggestions.indexOf(categoryId);
                return <div key={categoryId} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <Checkbox aria-label={t("Select the {name} suggestion", { name: category.name })} checked={selectedIndex >= 0} onCheckedChange={(checked) => setSelectedSuggestions((current) => checked ? [...current, categoryId] : current.filter((id) => id !== categoryId))} />
                  <div className="min-w-0 flex-1"><p className="font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{suggestion ? t("Matching phrases: {phrases} ⁜ Match strength {percent}%", { phrases: suggestion.evidence.join(", "), percent: number.format(Math.round(suggestion.confidence * 100)) }) : t("Topic you added")}</p></div>
                  {selectedIndex >= 0 ? <><label className="flex items-center gap-2 text-xs">{t("Weight")} <input type="range" min="0" max="10" step="0.5" value={categoryWeights[categoryId] ?? 1} onChange={(event) => setCategoryWeights((current) => ({ ...current, [categoryId]: Number(event.target.value) }))} aria-label={t("{name} weight", { name: category.name })} /></label><Button type="button" size="icon" variant="ghost" aria-label={t("Move {name} up", { name: category.name })} disabled={selectedIndex === 0} onClick={() => moveSuggestion(selectedIndex, -1)}><ArrowUp aria-hidden="true" /></Button><Button type="button" size="icon" variant="ghost" aria-label={t("Move {name} down", { name: category.name })} disabled={selectedIndex === selectedSuggestions.length - 1} onClick={() => moveSuggestion(selectedIndex, 1)}><ArrowDown aria-hidden="true" /></Button></> : null}
                </div>;
              })}
              {availableManualCategories.length ? <div className="flex gap-2"><select value={manualCategoryId} onChange={(event) => setManualCategoryId(event.target.value)} aria-label={t("Add another topic")} className="min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"><option value="">{t("Add another topic")}</option>{availableManualCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button type="button" variant="outline" disabled={!manualCategoryId} onClick={() => { const id = Number(manualCategoryId); setSelectedSuggestions((current) => [...current, id]); setCategoryWeights((current) => ({ ...current, [id]: 1 })); setManualCategoryId(""); }}>{t("Add")}</Button></div> : null}
              {inference?.contentLanguage && inference.contentLanguage !== "unknown" ? <p className="text-sm text-muted-foreground">{t("Suggested content language")}: {inference.contentLanguage}</p> : null}
              {draft.id && <div className="flex flex-wrap gap-2">{inference && (inference.suggestions.length > 0 || selectedSuggestions.length > 0) ? <Button type="button" onClick={acceptSuggestions} disabled={inferencePending}><Save data-icon="inline-start" aria-hidden="true" /> {t("Use my topics")}</Button> : null}<Button type="button" variant="outline" onClick={() => void loadInference(draft.id!, true, true)} disabled={inferencePending}><RefreshCw data-icon="inline-start" aria-hidden="true" /> {t("Analyze again")}</Button></div>}
              {inferenceMessage ? <p role="status" className="text-sm text-muted-foreground">{inferenceMessage}</p> : null}
              {inferenceAccepted ? <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/opportunities">{t("See your first opportunity")}</Link> : null}
            </CardContent>
          </Card> : null}
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary">@{draft.handle}</Badge><span className="text-muted-foreground">{draft.displayName}</span></div>
          <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">{t("Edit account and writing preferences")}</summary><div className="mt-4 flex flex-col gap-5">
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="daily-limit">{t("Daily publishing limit")}</FieldLabel>
                <Input id="daily-limit" type="number" min={1} max={100} value={draft.dailyLimit} onChange={(event) => setValue("dailyLimit", Number(event.target.value))} />
              </Field>
              <p className="self-end text-sm text-muted-foreground">{t("Automatic publishing is currently off. Manage permissions for each action below.")}</p>
            </div>
          </FieldGroup>

          <Separator />

          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="account-enabled">{t("Account active")}</FieldLabel>
                <FieldDescription>{t("This account can be used in intake and publishing workflows.")}</FieldDescription>
              </FieldContent>
              <Switch id="account-enabled" checked={draft.enabled} onCheckedChange={(value) => setValue("enabled", value)} />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="default-account">{t("Default account")}</FieldLabel>
                <FieldDescription>{t("The account selected first on the Opportunities and Drafts pages.")}</FieldDescription>
              </FieldContent>
              <Switch id="default-account" checked={draft.defaultAccount} onCheckedChange={(value) => setValue("defaultAccount", value)} />
            </Field>
          </FieldGroup>

          <Separator />

          <Field>
            <FieldLabel htmlFor="style-notes">{t("Style notes")}</FieldLabel>
            <Input id="style-notes" value={String(draft.styleProfile.tone || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, tone: event.target.value })} placeholder={t("clear, evidence-based, concise")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-niche">{t("Account niche")}</FieldLabel>
            <FieldDescription>{t("The topic for this publishing account. Each account has its own niche.")}</FieldDescription>
            <Input id="account-niche" value={String(draft.styleProfile.niche || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, niche: event.target.value })} placeholder={t("example: technology and entrepreneurship")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="account-categories">{t("Account categories")}</FieldLabel>
            <FieldDescription>{t("Select one or more categories from the catalog. Automatic publishing routes only to matching accounts.")}</FieldDescription>
            <select id="account-categories" multiple value={(Array.isArray(draft.styleProfile.categories) ? draft.styleProfile.categories.map(String) : []).filter((value) => categories.some((category) => category.slug === value))} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, categories: Array.from(event.currentTarget.selectedOptions).map((option) => option.value).slice(0, 12) })} className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm">
              {categories.filter((category) => category.enabled).map((category) => <option key={category.id} value={category.slug}>{category.name} ({category.slug})</option>)}
            </select>
          </Field>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="account-opening">{t("Opening format")}</FieldLabel>
                <Input id="account-opening" value={String(draft.styleProfile.opening || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, opening: event.target.value })} placeholder={t("Start with an emoji / direct headline / question")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-emoji">{t("Emoji rule")}</FieldLabel>
                <Input id="account-emoji" value={String(draft.styleProfile.emoji || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, emoji: event.target.value })} placeholder={t("⚡️ only for breaking news; otherwise do not use")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-attribution">{t("Source attribution")}</FieldLabel>
            <Input id="account-attribution" value={String(draft.styleProfile.attribution || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, attribution: event.target.value })} placeholder={t("Add a real source at the end (organization name); otherwise omit it")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="account-format">{t("Sentence and format rule")}</FieldLabel>
                <Input id="account-format" value={String(draft.styleProfile.formatRule || "")} onChange={(event) => setValue("styleProfile", { ...draft.styleProfile, formatRule: event.target.value })} placeholder={t("one paragraph, short sentences, no hashtags")} />
              </Field>
            </div>
          </FieldGroup>

          </div></details>

          {message && (
            <Alert>
              <AlertDescription><BrandText text={message} /></AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" aria-hidden="true" /> } {t("Save settings")}
            </Button>
            {(
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />} {t("Delete")}
              </Button>
            )}
            {(
              <Badge variant="outline" className="gap-1">
                {t("Settings belong to the connected 𝕏 account")}
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
