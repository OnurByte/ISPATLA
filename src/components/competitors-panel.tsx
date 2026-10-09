"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Competitor } from "@/server/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CompetitorsPanel({ initial, canManage = false }: { initial: Competitor[]; canManage?: boolean }) {
  const [items, setItems] = useState(initial);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function reload() {
    setItems(await fetch("/api/competitors", { cache: "no-store" }).then((response) => response.json() as Promise<Competitor[]>));
  }

  async function add() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/competitors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, name, category }) });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error || "Rakip kaydedilemedi");
    setHandle(""); setName(""); setCategory("");
    await reload();
    setMessage("Rakip eklendi; sonraki taramada son 50 postun tarihsel snapshot’ı alınacak.");
  }

  async function remove(item: Competitor) {
    if (!window.confirm(`@${item.handle} ve onun analytics kayıtları silinsin mi?`)) return;
    setPending(true);
    const response = await fetch(`/api/competitors/${item.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) return setMessage("Rakip silinemedi");
    await reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rakip izleme listesi</CardTitle>
        <CardDescription>{canManage ? "Kaynak havuzundan ayrıdır; yalnız public performans karşılaştırması için izlenir ve otomatik draft/publish akışına girmez." : "Ortak public performans karşılaştırması listesi. Yönetim kontrolleri operatör erişimi gerektirir."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage ? <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="competitor-handle">𝕏 handle</FieldLabel><Input id="competitor-handle" value={handle} onChange={(event) => setHandle(event.target.value.replace(/^@/, ""))} placeholder="rakiphesap" /></Field>
            <Field><FieldLabel htmlFor="competitor-name">Görünen ad</FieldLabel><Input id="competitor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="opsiyonel" /></Field>
            <Field><FieldLabel htmlFor="competitor-category">Kategoriler</FieldLabel><Input id="competitor-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="haber, magazin" /></Field>
          </div>
          <Button onClick={add} disabled={pending || !handle.trim()}><Plus data-icon="inline-start" aria-hidden="true" /> Rakip ekle</Button>
        </FieldGroup> : null}
        {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-2">
          {items.length ? items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0"><div className="font-medium">@{item.handle} {item.name && item.name !== item.handle ? `· ${item.name}` : ""}</div><div className="text-xs text-muted-foreground">{item.category || "kategorisiz"}{item.lastError ? ` · son hata: ${item.lastError}` : item.lastSuccessAt ? " · güncel veri alındı" : " · ilk tarama bekliyor"}</div></div>
              <div className="flex items-center gap-2"><Badge variant={item.enabled ? "secondary" : "outline"}>{item.enabled ? "izleniyor" : "pasif"}</Badge>{canManage ? <Button size="icon" variant="ghost" disabled={pending} onClick={() => remove(item)} aria-label={`@${item.handle} sil`}><Trash2 aria-hidden="true" /></Button> : null}</div>
            </div>
          )) : <p className="text-sm text-muted-foreground">Henüz izlenen rakip yok.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
