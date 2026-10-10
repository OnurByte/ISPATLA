"use client";

import Link from "next/link";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnHitShare, ShareableXPost } from "@/server/db-types";

type HitSharingData = { posts: ShareableXPost[]; shares: OwnHitShare[] };

function metric(value: number | null): string {
  return value === null ? "sunulmadı" : new Intl.NumberFormat("tr-TR").format(value);
}

export function HitSharingSettings({ initial }: { initial: HitSharingData }) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function createShare(remotePostId: string) {
    setPending(remotePostId);
    setMessage("");
    try {
      const response = await fetch("/api/hits", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ remotePostId }),
      });
      const body = await response.json() as OwnHitShare & { error?: string };
      if (!response.ok) throw new Error(body.error || "Paylaşım bağlantısı oluşturulamadı.");
      setData((current) => ({ ...current, shares: [body, ...current.shares.filter((share) => share.publicId !== body.publicId)] }));
      setMessage("Resmi 𝕏 gözlem kartı oluşturuldu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Paylaşım bağlantısı oluşturulamadı.");
    } finally { setPending(null); }
  }

  async function revokeShare(publicId: string) {
    setPending(publicId);
    setMessage("");
    try {
      const response = await fetch(`/api/hits/${publicId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Paylaşım kapatılamadı.");
      setData((current) => ({ ...current, shares: current.shares.map((share) => share.publicId === publicId ? { ...share, revokedAt: Math.floor(Date.now() / 1000) } : share) }));
      setMessage("Paylaşım kapatıldı; bağlantı artık açılmaz.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Paylaşım kapatılamadı.");
    } finally { setPending(null); }
  }

  async function toggleLeaderboard(share: OwnHitShare) {
    setPending(share.publicId);
    setMessage("");
    try {
      const response = await fetch(`/api/hits/${share.publicId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaderboardOptIn: !share.leaderboardOptIn }) });
      const body = await response.json() as { error?: string; leaderboardOptIn: boolean };
      if (!response.ok) throw new Error(body.error || "Katılım güncellenemedi.");
      setData((current) => ({ ...current, shares: current.shares.map((item) => item.publicId === share.publicId ? { ...item, leaderboardOptIn: body.leaderboardOptIn } : item) }));
      setMessage(body.leaderboardOptIn ? "Kanıt eşiği karşılandığında bu kart sıralamada görünebilir." : "Kart sıralamadan çıkarıldı.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Katılım güncellenemedi."); }
    finally { setPending(null); }
  }

  const activeByPost = new Map(data.shares.filter((share) => !share.revokedAt).map((share) => [share.remotePostId, share]));
  const activeShares = data.shares.filter((share) => !share.revokedAt);

  return <Card>
    <CardHeader><CardTitle>Resmi 𝕏 gözlemiyle paylaşılabilir gönderiler</CardTitle><CardDescription>Yalnızca hesabından yayımlanmış, onay kaydı bulunan ve resmi 𝕏 API verisiyle sonradan gözlenmiş postlar listelenir. Paylaşım her gönderi için ayrı ve varsayılan olarak kapalıdır.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {data.posts.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Henüz paylaşım için uygun, resmi verilerle gözlenmiş bir yayın yok.</p> : data.posts.map((post) => {
        const share = activeByPost.get(post.remotePostId);
        return <article key={post.remotePostId} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">@{post.accountHandle} · 𝕏 gönderisi</p><a className="text-sm underline underline-offset-4" href={post.postUrl} target="_blank" rel="noreferrer">𝕏&apos;te aç</a></div>
          <p className="whitespace-pre-wrap break-words text-sm">{post.text}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            {([ ["Görüntülenme", post.metrics.views], ["Beğeni", post.metrics.likes], ["Yanıt", post.metrics.replies], ["Yeniden paylaşım", post.metrics.reposts], ["Alıntı", post.metrics.quotes] ] as const).map(([label, value]) => <div key={label} className="rounded bg-muted/60 p-2"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{metric(value)}</dd></div>)}
          </dl>
          {share ? <p className="text-sm text-muted-foreground">Bu gönderi için paylaşım açık. Bağlantıyı aşağıdan yönetebilirsin.</p> : <Button type="button" size="sm" className="self-start" onClick={() => void createShare(post.remotePostId)} disabled={pending !== null}>{pending === post.remotePostId ? "Oluşturuluyor…" : "Paylaşılabilir kart oluştur"}</Button>}
        </article>;
      })}
      {activeShares.length > 0 && <section className="flex flex-col gap-2 border-t pt-4" aria-labelledby="active-hit-shares-title"><h3 id="active-hit-shares-title" className="text-sm font-semibold">Açık paylaşım bağlantıları</h3>{activeShares.map((share) => <div key={share.publicId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><a className="break-all underline underline-offset-4" href={`/h/${share.publicId}`} target="_blank" rel="noreferrer">/h/{share.publicId}</a><Button type="button" size="sm" variant="outline" aria-pressed={share.leaderboardOptIn} onClick={() => void toggleLeaderboard(share)} disabled={pending !== null}>{share.leaderboardOptIn ? "Sıralamadan çıkar" : "Sıralamaya katıl"}</Button><Button type="button" size="sm" variant="destructive" onClick={() => void revokeShare(share.publicId)} disabled={pending !== null}>{pending === share.publicId ? "Kapatılıyor…" : "Paylaşımı kapat"}</Button></div>)}</section>}
      <Link href="/leaderboard" className="self-start text-sm underline underline-offset-4">Kanıt eşikleri ve hit sıralaması</Link>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <p className="text-xs text-muted-foreground">Kartta yalnızca onaylanmış gönderi metni, 𝕏 bağlantısı, yayın/gözlem zamanı ve 𝕏 API&apos;sinin sunduğu sayılar yer alır. Sıralamaya katılım ayrı ve varsayılan olarak kapalıdır. Katılınca kendi geçmişinle karşılaştırma katı ve örnek sayısı görünür. Hesap ve gelişim sıralaması, paylaşılmamış düşük sonuçlar dahil hesabın tüm uygun resmi gözlemlerini kullanır; özel geçmiş metinleri ve gönderi kimlikleri açıklanmaz. Bağlantıyı kapatınca public sayfa hemen kaldırılır.</p>
    </CardContent>
  </Card>;
}
