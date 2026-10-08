"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type ConnectedAccount = { id: number; handle: string; displayName: string; connected: boolean; authState: string; scopes: string[] };
type TimelineItem = { id: string; text: string; createdAt: string; url: string };

function date(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Tarih yok";
}

export function XInspectorPage() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [message, setMessage] = useState("");
  const selectedIdRef = useRef("");

  const loadTimeline = useCallback(async (id: string) => {
    const response = await fetch(`/api/x/accounts/${id}/timeline`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setItems(response?.ok && Array.isArray(body.items) ? body.items as TimelineItem[] : []);
    if (!response?.ok) setMessage(body.error || "X timeline alınamadı.");
    setLoadingTimeline(false);
  }, []);

  const loadAccounts = useCallback(async () => {
    const response = await fetch("/api/x/accounts", { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    const next = response?.ok && Array.isArray(body.accounts) ? body.accounts as ConnectedAccount[] : [];
    setAccounts(next);
    const selectedId = next.some((account) => String(account.id) === selectedIdRef.current) ? selectedIdRef.current : String(next.find((account) => account.connected)?.id || "");
    selectedIdRef.current = selectedId;
    setAccountId(selectedId);
    setMessage(response?.ok ? "" : body.error || "X hesapları alınamadı.");
    setLoadingAccounts(false);
    if (selectedId && next.some((account) => String(account.id) === selectedId && account.connected)) {
      setLoadingTimeline(true);
      await loadTimeline(selectedId);
    } else {
      setItems([]);
      setLoadingTimeline(false);
    }
  }, [loadTimeline]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const response = await fetch("/api/x/accounts", { cache: "no-store" }).catch(() => null);
      const body = response ? await response.json().catch(() => ({})) : {};
      if (!active) return;
      const next = response?.ok && Array.isArray(body.accounts) ? body.accounts as ConnectedAccount[] : [];
      setAccounts(next);
      const selectedId = next.find((account) => account.connected)?.id.toString() || "";
      selectedIdRef.current = selectedId;
      setAccountId(selectedId);
      if (!response?.ok) setMessage(body.error || "X hesapları alınamadı.");
      setLoadingAccounts(false);
      if (!selectedId) return;
      setLoadingTimeline(true);
      const timelineResponse = await fetch(`/api/x/accounts/${selectedId}/timeline`, { cache: "no-store" }).catch(() => null);
      const timelineBody = timelineResponse ? await timelineResponse.json().catch(() => ({})) : {};
      if (!active) return;
      setItems(timelineResponse?.ok && Array.isArray(timelineBody.items) ? timelineBody.items as TimelineItem[] : []);
      if (!timelineResponse?.ok) setMessage(timelineBody.error || "X timeline alınamadı.");
      setLoadingTimeline(false);
    }
    void initialize();
    return () => { active = false; };
  }, []);

  const connected = accounts.filter((account) => account.connected);
  const selected = accounts.find((account) => String(account.id) === accountId);

  return <div className="flex flex-col gap-5">
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5"><CardTitle>Bağlı X hesabı timeline’ı</CardTitle><CardDescription>Resmi X API üzerinden yalnızca kendi hesabınızın son postlarını okuyun. Bu ekranda beğeni, repost veya reply işlemi yoktur.</CardDescription></div>
        <Button variant="outline" onClick={() => { setLoadingAccounts(true); if (accountId) setLoadingTimeline(true); void loadAccounts(); }} disabled={loadingAccounts || loadingTimeline}>
          {(loadingAccounts || loadingTimeline) ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />} Yenile
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected.length ? <div className="flex flex-wrap items-center gap-3">
          <Select value={accountId} onValueChange={(value) => {
            const nextId = value || "";
            selectedIdRef.current = nextId;
            setAccountId(nextId);
            setItems([]);
            setMessage("");
            if (nextId) { setLoadingTimeline(true); void loadTimeline(nextId); }
          }}>
            <SelectTrigger className="w-full max-w-sm" aria-label="Bağlı X hesabı"><SelectValue placeholder="Bir hesap seçin" /></SelectTrigger>
            <SelectContent>{connected.map((account) => <SelectItem key={account.id} value={String(account.id)}>@{account.handle}{account.displayName ? ` · ${account.displayName}` : ""}</SelectItem>)}</SelectContent>
          </Select>
          {selected ? <div className="flex flex-wrap gap-1.5" aria-label="X API izin kapsamları">{selected.scopes.map((scope) => <Badge key={scope} variant="outline">{scope}</Badge>)}</div> : null}
        </div> : loadingAccounts ? <p className="text-sm text-muted-foreground">Bağlı hesaplar yükleniyor…</p> : <Empty className="border border-dashed py-7"><EmptyHeader><EmptyTitle>Bağlı X hesabı yok</EmptyTitle><EmptyDescription>Hesaplar sayfasından X hesabınızı bağlayın; timeline okuma için tweet.read izni gerekir.</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>
    </Card>

    {items.map((item) => <Card key={item.id}><CardContent className="flex flex-col gap-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{date(item.createdAt)}</span><a className="inline-flex items-center gap-1 text-primary underline" href={item.url} target="_blank" rel="noreferrer">X’te aç <ExternalLink aria-hidden="true" className="size-3" /></a></div>
      <p className="whitespace-pre-wrap text-sm">{item.text}</p>
    </CardContent></Card>)}
    {selected?.connected && !items.length && !loadingTimeline && !message ? <Empty className="border border-dashed py-8"><EmptyHeader><EmptyTitle>Timeline boş</EmptyTitle><EmptyDescription>Bu hesap için X’ten okunabilir post bulunamadı.</EmptyDescription></EmptyHeader></Empty> : null}
    {message ? <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert> : null}
  </div>;
}
