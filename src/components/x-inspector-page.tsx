"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type LoggedAccount = { id: number; handle: string; displayName: string; health: { queue?: Record<string, number>; session?: { warm?: boolean } } };
type Item = { tweetId?: string; url?: string; author?: string; text?: string; likes?: number; reposts?: number; replies?: number; views?: number };

export function XInspectorPage() {
  const [accounts, setAccounts] = useState<LoggedAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<Record<string, string>>({});
  const selected = accounts.find((account) => String(account.id) === accountId);
  async function loadAccounts() { setPending(true); const response = await fetch("/api/x/accounts", { method: "POST" }); const body = await response.json().catch(() => ({})); const next = response.ok ? body.accounts || [] : []; setAccounts(next); setAccountId((current) => next.some((account: LoggedAccount) => String(account.id) === current) ? current : String(next[0]?.id || "")); setMessage(response.ok ? "" : body.error || "x-use hesapları alınamadı."); setPending(false); }
  async function loadTimeline(id = accountId) { if (!id) return; setPending(true); const response = await fetch(`/api/x/accounts/${id}/timeline`, { method: "POST" }); const body = await response.json().catch(() => ({})); setItems(response.ok ? body.items || [] : []); setMessage(response.ok ? "" : body.error || "Timeline alınamadı."); setPending(false); }
  useEffect(() => {
    let current = true;
    void fetch("/api/x/accounts", { method: "POST" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!current) return;
      const next = response.ok ? body.accounts || [] : [];
      setAccounts(next);
      setAccountId((value) => next.some((account: LoggedAccount) => String(account.id) === value) ? value : String(next[0]?.id || ""));
      setMessage(response.ok ? "" : body.error || "x-use hesapları alınamadı.");
    }).catch(() => { if (current) setMessage("x-use hesapları alınamadı."); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!accountId) return;
    let current = true;
    void fetch(`/api/x/accounts/${accountId}/timeline`, { method: "POST" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!current) return;
      setItems(response.ok ? body.items || [] : []);
      setMessage(response.ok ? "" : body.error || "Timeline alınamadı.");
    }).catch(() => { if (current) setMessage("Timeline alınamadı."); });
    return () => { current = false; };
  }, [accountId]);
  async function engage(action: "like" | "retweet" | "reply", item: Item) { const response = await fetch("/api/x/engagements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: Number(accountId), action, tweetUrl: item.url, text: reply[item.tweetId || item.url || ""] || "" }) }); const body = await response.json().catch(() => ({})); setMessage(response.ok ? (body.automatic ? "Job auto hesap için planlandı." : "Job planlandı; manual hesapta kuyruktan çalıştır.") : body.error || "Etkileşim planlanamadı."); }
  return <div className="flex flex-col gap-5"><Card><CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle>Bağlı hesapların son postları</CardTitle><CardDescription>Yalnız x-use’ta aktif ve geçerli oturum cookie’si olan hesaplar gösterilir.</CardDescription></div><Button variant="outline" onClick={() => { void loadAccounts(); if (accountId) void loadTimeline(); }} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} Yenile</Button></CardHeader><CardContent>{accounts.length ? <div className="flex flex-wrap items-center gap-3"><Select value={accountId} onValueChange={(value) => setAccountId(value || "")}><SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}{account.displayName ? ` · ${account.displayName}` : ""}</SelectItem>)}</SelectContent></Select>{selected && <div className="flex gap-2 text-xs text-muted-foreground"><Badge variant="outline">{selected.health.session?.warm ? "warm session" : "cold session"}</Badge><span>queue pending: {selected.health.queue?.pending || 0}</span></div>}</div> : <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Geçerli x-use oturumu yok</EmptyTitle><EmptyDescription>Hesabın x-use eşlemesini ve cookie health durumunu Hesaplar ekranından kontrol et.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card>{items.map((item) => { const key = item.tweetId || item.url || item.text || "item"; return <Card key={key}><CardContent className="flex flex-col gap-3 pt-6"><div className="text-sm text-muted-foreground">{item.author} · {item.likes || 0} beğeni · {item.reposts || 0} repost · {item.replies || 0} yanıt · {item.views || 0} görüntülenme</div><p className="whitespace-pre-wrap">{item.text}</p>{item.url && <a className="text-sm text-primary underline" href={item.url} target="_blank" rel="noreferrer">X’te aç</a>}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => engage("like", item)}>Beğen</Button><Button size="sm" variant="outline" onClick={() => engage("retweet", item)}>Repost</Button></div><Textarea value={reply[key] || ""} onChange={(event) => setReply((current) => ({ ...current, [key]: event.target.value }))} placeholder="Reply metni" /><Button size="sm" className="w-fit" onClick={() => engage("reply", item)} disabled={!(reply[key] || "").trim()}>Reply planla</Button></CardContent></Card>; })}{!pending && selected && !items.length && !message && <Empty className="border border-dashed py-10"><EmptyHeader><EmptyTitle>Post bulunamadı</EmptyTitle><EmptyDescription>Bu hesabın profile timeline’ında gösterilecek post yok.</EmptyDescription></EmptyHeader></Empty>}{message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}</div>;
}
