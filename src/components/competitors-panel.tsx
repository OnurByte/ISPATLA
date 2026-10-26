"use client";

import { useState } from "react";
import { useUiText } from "@/i18n/ui-client";
import { Plus, Trash2 } from "lucide-react";
import type { Competitor } from "@/server/db-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function CompetitorsPanel({ initial, canManage = false }: { initial: Competitor[]; canManage?: boolean }) {
  const { t } = useUiText();
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
    if (!response.ok) return setMessage(t(body.error || "Could not save competitor."));
    setHandle(""); setName(""); setCategory("");
    await reload();
    setMessage(t("Competitor added. The next scan will capture a historical snapshot of the latest 50 posts."));
  }

  async function remove(item: Competitor) {
    if (!window.confirm(t("Delete @{handle} and its analytics records?", { handle: item.handle }))) return;
    setPending(true);
    const response = await fetch(`/api/competitors/${item.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(t(body.error || "Could not delete competitor."));
    await reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Competitor watchlist")}</CardTitle>
        <CardDescription>{canManage ? t("This list is separate from the source pool. It tracks public performance only and is not part of automatic draft or publishing workflows.") : t("Shared public performance comparison list. Management controls require operator access.")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canManage ? <FieldGroup>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="competitor-handle">{t("𝕏 handle")}</FieldLabel><Input id="competitor-handle" value={handle} onChange={(event) => setHandle(event.target.value.replace(/^@/, ""))} placeholder="@elonmusk" /></Field>
            <Field><FieldLabel htmlFor="competitor-name">{t("Display name")}</FieldLabel><Input id="competitor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Optional")} /></Field>
            <Field><FieldLabel htmlFor="competitor-category">{t("Categories")}</FieldLabel><Input id="competitor-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder={t("news, entertainment")} /></Field>
          </div>
          <Button onClick={add} disabled={pending || !handle.trim()}><Plus data-icon="inline-start" aria-hidden="true" /> {t("Add competitor")}</Button>
        </FieldGroup> : null}
        {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-2">
          {items.length ? items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0"><div className="font-medium">@{item.handle} {item.name && item.name !== item.handle ? ` ⁜ ${item.name}` : ""}</div><div className="text-xs text-muted-foreground">{item.category || t("Uncategorized")}{item.lastError ? ` ⁜ ${t("Last error")}: ${item.lastError}` : item.lastSuccessAt ? ` ⁜ ${t("Latest data received")}` : ` ⁜ ${t("First scan pending")}`}</div></div>
              <div className="flex items-center gap-2"><Badge variant={item.enabled ? "secondary" : "outline"}>{item.enabled ? t("Watching") : t("Inactive")}</Badge>{canManage ? <Button size="icon" variant="ghost" disabled={pending} onClick={() => remove(item)} aria-label={t("Delete @{handle}", { handle: item.handle })}><Trash2 aria-hidden="true" /></Button> : null}</div>
            </div>
          )) : <p className="text-sm text-muted-foreground">{t("No competitors are being tracked yet.")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
