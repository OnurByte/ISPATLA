"use client";

import Link from "next/link";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OwnHitShare, ShareableXPost } from "@/server/db-types";
import { ShareActions } from "@/components/share-actions";
import { publicShareUrl, publicSocialImageUrl } from "@/lib/social-sharing";
import type { Locale } from "@/i18n/config";
import { socialCopy } from "@/i18n/social-copy";
import { hitSettingsCopy } from "@/i18n/hit-settings-copy";

type HitSharingData = { posts: ShareableXPost[]; shares: OwnHitShare[] };

function metric(value: number | null, locale: Locale): string {
  return value === null ? socialCopy[locale].unknown : new Intl.NumberFormat(locale).format(value);
}

export function HitSharingSettings({ initial, locale }: { initial: HitSharingData; locale: Locale }) {
  const words = hitSettingsCopy[locale];
  const social = socialCopy[locale];
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
      if (!response.ok) throw new Error(body.error || words.createError);
      setData((current) => ({ ...current, shares: [body, ...current.shares.filter((share) => share.publicId !== body.publicId)] }));
      setMessage(words.created);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : words.createError);
    } finally { setPending(null); }
  }

  async function revokeShare(publicId: string) {
    setPending(publicId);
    setMessage("");
    try {
      const response = await fetch(`/api/hits/${publicId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || words.revokeError);
      setData((current) => ({ ...current, shares: current.shares.map((share) => share.publicId === publicId ? { ...share, revokedAt: Math.floor(Date.now() / 1000) } : share) }));
      setMessage(words.revoked);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : words.revokeError);
    } finally { setPending(null); }
  }

  async function toggleLeaderboard(share: OwnHitShare) {
    setPending(share.publicId);
    setMessage("");
    try {
      const response = await fetch(`/api/hits/${share.publicId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ leaderboardOptIn: !share.leaderboardOptIn }) });
      const body = await response.json() as { error?: string; leaderboardOptIn: boolean };
      if (!response.ok) throw new Error(body.error || words.optError);
      setData((current) => ({ ...current, shares: current.shares.map((item) => item.publicId === share.publicId ? { ...item, leaderboardOptIn: body.leaderboardOptIn } : item) }));
      setMessage(body.leaderboardOptIn ? words.optInSuccess : words.optOutSuccess);
    } catch (error) { setMessage(error instanceof Error ? error.message : words.optError); }
    finally { setPending(null); }
  }

  const activeByPost = new Map(data.shares.filter((share) => !share.revokedAt).map((share) => [share.remotePostId, share]));
  const activeShares = data.shares.filter((share) => !share.revokedAt);

  return <Card>
    <CardHeader><CardTitle>{words.title}</CardTitle><CardDescription>{words.description}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {data.posts.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{words.empty}</p> : data.posts.map((post) => {
        const share = activeByPost.get(post.remotePostId);
        return <article key={post.remotePostId} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">@{post.accountHandle} · {words.post}</p><a className="text-sm underline underline-offset-4" href={post.postUrl} target="_blank" rel="noreferrer">{social.openX}</a></div>
          <p className="whitespace-pre-wrap break-words text-sm">{post.text}</p>
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            {([[social.views, post.metrics.views], [social.likes, post.metrics.likes], [social.replies, post.metrics.replies], [social.reposts, post.metrics.reposts], [social.quotes, post.metrics.quotes]] as const).map(([label, value]) => <div key={label} className="rounded bg-muted/60 p-2"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{metric(value, locale)}</dd></div>)}
          </dl>
          {share ? <p className="text-sm text-muted-foreground">{words.alreadyShared}</p> : <Button type="button" size="sm" className="self-start" onClick={() => void createShare(post.remotePostId)} disabled={pending !== null}>{pending === post.remotePostId ? words.creating : words.create}</Button>}
        </article>;
      })}
      {activeShares.length > 0 && <section className="flex flex-col gap-2 border-t pt-4" aria-labelledby="active-hit-shares-title"><h3 id="active-hit-shares-title" className="text-sm font-semibold">{words.active}</h3>{activeShares.map((share) => <div key={share.publicId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><a className="break-all underline underline-offset-4" href={`/h/${share.publicId}`} target="_blank" rel="noreferrer">/h/{share.publicId}</a><ShareActions url={publicShareUrl("/h/" + share.publicId)} text={words.shareText + " · İSPATLA"} locale={locale} imageUrl={publicSocialImageUrl("/h/" + share.publicId)} /><Button type="button" size="sm" variant="outline" aria-pressed={share.leaderboardOptIn} onClick={() => void toggleLeaderboard(share)} disabled={pending !== null}>{share.leaderboardOptIn ? words.optOut : words.optIn}</Button><Button type="button" size="sm" variant="destructive" onClick={() => void revokeShare(share.publicId)} disabled={pending !== null}>{pending === share.publicId ? words.revoking : words.revoke}</Button></div>)}</section>}
      <Link href="/leaderboard" className="self-start text-sm underline underline-offset-4">{words.leaderboard}</Link>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <p className="text-xs text-muted-foreground">{words.notice}</p>
    </CardContent>
  </Card>;
}
