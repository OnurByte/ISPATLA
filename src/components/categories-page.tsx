"use client";

import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import type { Account, CategoryDefinition } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Draft = Omit<CategoryDefinition, "id" | "createdAt" | "updatedAt"> & { id?: number };
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const blank = (): Draft => ({ slug: "", name: "", enabled: true, builtIn: false, baseStrategy: "generic", clusterStrategy: "topic", verificationMode: "moderate", description: "", positiveExamples: [], negativeExamples: [], keywords: [], excludedKeywords: [], seedHandles: [], defaultFormats: ["post"], sourcePolicy: {}, riskPolicy: {}, scoringPolicy: {}, publishingPolicy: {}, aiContext: "" });
const draftFor = (item: CategoryDefinition): Draft => ({ ...item });
const baseLabels: Record<string, string> = { generic: "General content", news: "News", politics: "Politics", technology: "Technology", finance: "Finance", sports: "Sports", entertainment: "Entertainment", meme: "Humor", shitpost: "Free-form humor" };
const clusterLabels: Record<string, string> = { event: "Development", topic: "Topic", meme: "Humor", conversation: "Conversation", format: "Format", hybrid: "Hybrid" };
const verificationLabels: Record<string, string> = { strict: "High", moderate: "Balanced", minimal: "Basic", none: "Off" };

export function CategoriesPage({ initial, accounts }: { initial: CategoryDefinition[]; accounts: Pick<Account, "id" | "handle" | "displayName">[] }) {
  const { t } = useUiText();
  const [items, setItems] = useState(initial);
  const [accountId, setAccountId] = useState(accounts[0]?.id || 0);
  const [draft, setDraft] = useState<Draft>(blank());
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const editing = Boolean(draft.id);
  const start = (item?: CategoryDefinition) => {
    const next = item ? draftFor(item) : blank();
    setDraft(next);
    setMessage("");
  };
  async function save() {
    setPending(true); setMessage("");
    try {
      const hasTopicSignal = [draft.positiveExamples, draft.negativeExamples, draft.keywords, draft.seedHandles].some((values) => values.some((value) => value.trim()));
      if (!draft.name.trim() || !draft.slug.trim() || !draft.description.trim() || !hasTopicSignal) {
        setMessage(t("Add a category name, short address, and description, plus at least one keyword, example, or source account."));
        return;
      }
      const body = { ...draft, accountId };
      const response = await fetch(editing ? `/api/categories/${draft.id}` : "/api/categories", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t(result.error || "Could not save category."));
      const next = await fetch(`/api/categories?accountId=${accountId}`, { cache: "no-store" }).then((item) => item.json() as Promise<CategoryDefinition[]>);
      setItems(next); start(); setMessage(t("Category saved."));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("Could not save category.")); } finally { setPending(false); }
  }
  async function remove(item: CategoryDefinition) {
    if (!window.confirm(t("Delete category {name}?", { name: item.name }))) return;
    setPending(true); const response = await fetch(`/api/categories/${item.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) }); const result = await response.json().catch(() => ({})); setPending(false);
    if (!response.ok) return setMessage(t(result.error || "Could not delete category."));
    setItems((current) => current.filter((candidate) => candidate.id !== item.id)); if (draft.id === item.id) start(); setMessage(t("Category deleted."));
  }
  const changeList = (key: "positiveExamples" | "negativeExamples" | "keywords" | "excludedKeywords" | "seedHandles" | "defaultFormats", value: string) => setDraft({ ...draft, [key]: list(value) });
  const updatePolicy = (key: "sourcePolicy" | "riskPolicy" | "scoringPolicy" | "publishingPolicy", name: string, value: unknown) => setDraft({ ...draft, [key]: { ...draft[key], [name]: value } });
  async function selectAccount(nextAccountId: number) {
    setAccountId(nextAccountId); start();
    if (!nextAccountId) { setItems([]); return; }
    setPending(true);
    try { const response = await fetch(`/api/categories?accountId=${nextAccountId}`, { cache: "no-store" }); if (!response.ok) throw new Error(t("Could not load this account’s categories.")); setItems(await response.json() as CategoryDefinition[]); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("Could not load this account’s categories.")); }
    finally { setPending(false); }
  }
  return <div className="flex flex-col gap-5">
    <Card><CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4"><div><CardTitle>{t("Categories")}</CardTitle><CardDescription>{t("Built-in categories are shared. Custom categories and sources belong to the selected account.")}</CardDescription></div><Field className="min-w-56"><FieldLabel htmlFor="category-account">{t("Account")}</FieldLabel><Select value={accountId ? String(accountId) : "none"} onValueChange={(value) => { void selectAccount(value === "none" ? 0 : Number(value)); }}><SelectTrigger id="category-account"><SelectValue>{accounts.find((account) => account.id === accountId) ? `@${accounts.find((account) => account.id === accountId)!.handle}` : t("No connected account")}</SelectValue></SelectTrigger><SelectContent>{accounts.length ? accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}</SelectItem>) : <SelectItem value="none">{t("No connected account")}</SelectItem>}</SelectContent></Select></Field></CardHeader><CardContent className="flex flex-col gap-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="font-medium">{(item.builtIn ? t(baseLabels[item.baseStrategy] || item.name) : item.name)}</p><p className="text-xs text-muted-foreground">{item.description ? (item.builtIn ? t(item.description) : item.description) : `${t(baseLabels[item.baseStrategy] || "General content")} ⁜ ${t(clusterLabels[item.clusterStrategy] || "Hybrid")}`}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant={item.builtIn ? "secondary" : "outline"}>{item.builtIn ? t("Built-in ⁜ read-only") : t("Custom to this account")}</Badge>{!item.builtIn && <><Button size="icon" variant="ghost" disabled={pending} onClick={() => start(item)} aria-label={t("Edit category {name}", { name: item.name })}><Pencil aria-hidden="true" /></Button><Button size="icon" variant="ghost" disabled={pending} onClick={() => remove(item)} aria-label={t("Delete category {name}", { name: item.name })}><Trash2 aria-hidden="true" /></Button></>}</div></div>)}{!items.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("No categories for this account yet.")}</p>}<Button className="self-start" variant="outline" onClick={() => start()} disabled={pending || !accountId}><Plus data-icon="inline-start" aria-hidden="true" /> {t("New custom category")}</Button></CardContent></Card>
    {accountId ? <Card><CardHeader><CardTitle>{editing ? t("Edit {name}", { name: draft.name || t("Category") }) : t("New category")}</CardTitle><CardDescription>{t("Edit the topic, examples, and writing preferences. Changes apply only to the selected account.")}</CardDescription></CardHeader><CardContent><FieldGroup>
      <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="category-name">{t("Category name")}</FieldLabel><Input id="category-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field><Field><FieldLabel htmlFor="category-slug">{t("Short address")}</FieldLabel><Input id="category-slug" value={draft.slug} disabled={editing && draft.builtIn} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder={t("example: monero")} /></Field></div>
      <Field><FieldLabel htmlFor="category-description">{t("Short description")}</FieldLabel><Input id="category-description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("What topics does this category cover?")} /></Field>
      <Field><FieldLabel htmlFor="category-verification">{t("Source verification level")}</FieldLabel><Select value={draft.verificationMode} onValueChange={(value) => setDraft({ ...draft, verificationMode: value as Draft["verificationMode"] })}><SelectTrigger id="category-verification"><SelectValue>{t(verificationLabels[draft.verificationMode])}</SelectValue></SelectTrigger><SelectContent>{["strict", "moderate", "minimal", "none"].map((value) => <SelectItem key={value} value={value}>{t(verificationLabels[value])}</SelectItem>)}</SelectContent></Select></Field>
      <div className="grid gap-3 sm:grid-cols-2">{([ ["keywords", "Topic keywords"], ["excludedKeywords", "Excluded keywords"], ["seedHandles", "Example 𝕏 accounts"], ["positiveExamples", "Good content examples"], ["negativeExamples", "Content to avoid"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`category-${key}`}>{t(label)}</FieldLabel><Input id={`category-${key}`} value={draft[key].join(", ")} onChange={(e) => changeList(key, e.target.value)} placeholder={t("Separate with commas")} /></Field>)}</div>
      <Field><FieldLabel htmlFor="category-ai-context">{t("Writing instructions")}</FieldLabel><Textarea id="category-ai-context" value={draft.aiContext} onChange={(e) => setDraft({ ...draft, aiContext: e.target.value })} placeholder={t("Describe the tone and rules to use when creating content about this topic.")} /></Field>
      <details className="rounded-md border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">{t("Advanced category settings")}</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="category-base">{t("Content approach")}</FieldLabel><Select value={draft.baseStrategy} onValueChange={(value) => setDraft({ ...draft, baseStrategy: value as Draft["baseStrategy"] })}><SelectTrigger id="category-base"><SelectValue>{t(baseLabels[draft.baseStrategy] || "General content")}</SelectValue></SelectTrigger><SelectContent>{Object.keys(baseLabels).map((value) => <SelectItem key={value} value={value}>{t(baseLabels[value])}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="category-cluster">{t("Group similar posts by")}</FieldLabel><Select value={draft.clusterStrategy} onValueChange={(value) => setDraft({ ...draft, clusterStrategy: value as Draft["clusterStrategy"] })}><SelectTrigger id="category-cluster"><SelectValue>{t(clusterLabels[draft.clusterStrategy] || "Hybrid")}</SelectValue></SelectTrigger><SelectContent>{Object.keys(clusterLabels).map((value) => <SelectItem key={value} value={value}>{t(clusterLabels[value])}</SelectItem>)}</SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="category-formats">{t("Content formats")}</FieldLabel><Input id="category-formats" value={draft.defaultFormats.join(", ")} onChange={(e) => changeList("defaultFormats", e.target.value)} placeholder="post, thread, reply" /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.sourcePolicy.requireAttribution === true} onCheckedChange={(checked) => updatePolicy("sourcePolicy", "requireAttribution", checked)} /> {t("Cite the source in content")}</label>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.publishingPolicy.paused === true} onCheckedChange={(checked) => updatePolicy("publishingPolicy", "paused", checked)} /> {t("Pause automatic publishing for this category")}</label>
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">{t("Content risk rules")}</p><div className="grid gap-3 sm:grid-cols-2">{([ ["fabricatedFact", "Fabricated information"], ["harassment", "Harassment and targeting"], ["privateLife", "Private life"], ["rumor", "Unverified rumor"], ["protectedTarget", "Targeting sensitive groups"] ] as const).map(([key, label]) => <Field key={key}><FieldLabel htmlFor={`risk-${key}`}>{t(label)}</FieldLabel><Select value={String(draft.riskPolicy[key] || "allow")} onValueChange={(value) => updatePolicy("riskPolicy", key, value)}><SelectTrigger id={`risk-${key}`}><SelectValue>{t(({ allow: "No additional rule", avoid: "Avoid", block: "Block" } as Record<string, string>)[String(draft.riskPolicy[key] || "allow")])}</SelectValue></SelectTrigger><SelectContent>{[["allow", "No additional rule"], ["avoid", "Avoid"], ["block", "Block"]].map(([value, name]) => <SelectItem key={value} value={value}>{t(name)}</SelectItem>)}</SelectContent></Select></Field>)}</div></div>
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">{t("Content quality preferences")}</p><div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="score-novelty">{t("Originality")}</FieldLabel><Select value={String(draft.scoringPolicy.novelty || "balanced")} onValueChange={(value) => updatePolicy("scoringPolicy", "novelty", value)}><SelectTrigger id="score-novelty"><SelectValue>{t(({ balanced: "Balanced", high: "High", very_high: "Very high" } as Record<string, string>)[String(draft.scoringPolicy.novelty || "balanced")])}</SelectValue></SelectTrigger><SelectContent>{[["balanced", "Balanced"], ["high", "High"], ["very_high", "Very high"]].map(([value, name]) => <SelectItem key={value} value={value}>{t(name)}</SelectItem>)}</SelectContent></Select></Field><Field><FieldLabel htmlFor="score-confirmation">{t("Fact checking")}</FieldLabel><Select value={String(draft.scoringPolicy.confirmation || "recommended")} onValueChange={(value) => updatePolicy("scoringPolicy", "confirmation", value)}><SelectTrigger id="score-confirmation"><SelectValue>{t(({ recommended: "Recommended", required: "Required", optional: "Optional" } as Record<string, string>)[String(draft.scoringPolicy.confirmation || "recommended")])}</SelectValue></SelectTrigger><SelectContent>{[["recommended", "Recommended"], ["required", "Required"], ["optional", "Optional"]].map(([value, name]) => <SelectItem key={value} value={value}>{t(name)}</SelectItem>)}</SelectContent></Select></Field></div></div>
      </div></details>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.enabled} onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })} /> {t("Enabled")}</label>
      {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}<div className="flex gap-2"><Button onClick={save} disabled={pending}><Save data-icon="inline-start" aria-hidden="true" />{t("Save")}</Button><Button variant="outline" onClick={() => start()} disabled={pending}><Plus data-icon="inline-start" aria-hidden="true" /> {t("Clear")}</Button></div>
    </FieldGroup></CardContent></Card> : null}
  </div>;
}
