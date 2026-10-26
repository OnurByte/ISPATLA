import { BrandText } from "@/components/brand-text";
import { PostActions } from "./post-actions";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isAllowedAvatarUrl, isAllowedMediaUrl } from "@/server/security";
import type { PostView } from "@/server/post-view";
import type { XPost } from "@/server/x-reader";
import { internalPostUrl } from "@/lib/post-url";
import { localizePath, type Locale } from "@/i18n/config";

function PostBody({ post, locale }: { post: XPost; locale: Locale }) {
  return <div className="flex flex-col gap-5">
    <div className="flex items-center gap-3"><Avatar>{isAllowedAvatarUrl(post.author.avatarUrl) && <AvatarImage src={post.author.avatarUrl} alt="" />}<AvatarFallback>{post.author.handle.slice(0, 2)}</AvatarFallback></Avatar><div><p className="font-medium">{post.author.name || post.author.handle}</p><p className="text-sm text-muted-foreground">@{post.author.handle}</p></div></div>
    <p className="whitespace-pre-wrap break-words text-base leading-7" dir="auto">{post.text}</p>
    <div className="grid gap-3">{post.media.slice(0, 4).map((media, index) => media.type === "photo" && isAllowedMediaUrl(media.url, "photo") ? <Image key={index} src={media.url} alt={locale === "tr" ? "Gönderi görseli" : "Post image"} width={1200} height={800} unoptimized className="h-auto max-h-[70vh] w-full rounded-md object-contain" /> : media.type === "video" ? <video key={index} controls preload="none" className="max-h-[70vh] w-full">{media.variants.filter((variant) => isAllowedMediaUrl(variant.url, "video") && variant.contentType === "video/mp4").map((variant) => <source key={variant.url} src={variant.url} type="video/mp4" />)}</video> : null)}</div>
    {post.replyToPost && <Card><CardHeader><CardTitle>{locale === "tr" ? "Yanıt verilen gönderi" : "Replying to"}</CardTitle></CardHeader><CardContent><PostBody post={post.replyToPost} locale={locale} /></CardContent></Card>}
    {post.quotedPost && <Card><CardHeader><CardTitle>{locale === "tr" ? "Alıntılanan gönderi" : "Quoted post"}</CardTitle></CardHeader><CardContent><PostBody post={post.quotedPost} locale={locale} /></CardContent></Card>}
    <dl className="flex flex-wrap gap-5 text-sm">{([['likes', locale === 'tr' ? 'Beğeni' : 'Likes'], ['reposts', locale === 'tr' ? 'Yeniden paylaşım' : 'Reposts'], ['replies', locale === 'tr' ? 'Yanıt' : 'Replies'], ['views', locale === 'tr' ? 'Görüntülenme' : 'Views']] as const).map(([key, label]) => <div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{post.metrics[key] === null ? '—' : new Intl.NumberFormat(locale).format(post.metrics[key])}</dd></div>)}</dl>
    {post.createdAt > 0 && <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(post.createdAt * 1000)}</p>}
  </div>;
}

export function PostDetail({ view, locale }: { view: PostView; locale: Locale }) {
  const tr = locale === "tr";
  return <Card className="mx-auto w-full max-w-3xl">
    <CardHeader><CardTitle><h1>{tr ? 'Gönderi inceleyici' : 'Post viewer'}</h1></CardTitle><CardDescription>FXTwitter ⁜ {tr ? 'Son gözlem' : 'Last observation'}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(view.observedAt * 1000)}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-6">
      {view.stale && <Alert><AlertDescription>{tr ? 'Kaynak şu anda alınamadı. Son kaydedilen gözlem gösteriliyor.' : 'The source could not be refreshed. Showing the last saved observation.'}</AlertDescription></Alert>}
      {view.post.sensitive && <Badge variant="outline">{tr ? 'Hassas içerik' : 'Sensitive content'}</Badge>}
      <PostBody post={view.post} locale={locale} />
      <Separator />
      {view.analysis && <div className="flex flex-col gap-2"><h2 className="font-semibold"><BrandText text={tr ? "ispatla.tr analizi" : "ispatla.tr analysis"} /></h2><p className="text-sm">{tr ? "Gözlem skoru" : "Observation score"}: {view.analysis.score.toFixed(1)}</p><p className="text-sm text-muted-foreground">{view.analysis.reason}</p>{view.categories.length > 0 && <p className="text-sm">{tr ? "Seçili kategoriler" : "Selected categories"}: {view.categories.join(", ")}</p>}{view.draftIds.map((id) => <Link key={id} className="text-sm underline" href={`${localizePath(locale, "/drafts")}?draft=${id}`}>{tr ? "Taslağınızı açın" : "Open your draft"} #{id}</Link>)}</div>}
      <div className="flex flex-wrap gap-2"><PostActions id={view.post.id} saved={view.saved} locale={locale} /><Button variant="outline" nativeButton={false} render={<Link href={`${localizePath(locale, '/drafts')}?externalId=${view.post.id}`} />}>{tr ? 'Taslak oluştur' : 'Create draft'}</Button><Button variant="outline" nativeButton={false} render={<Link href={`${localizePath(locale, internalPostUrl(view.post.id))}?conversation=1`} />}>{tr ? 'Konuşmayı incele' : 'View conversation'}</Button><Button variant="ghost" nativeButton={false} render={<a href={`https://x.com/i/web/status/${view.post.id}`} target="_blank" rel="noreferrer" />}>{tr ? '𝕏’te aç' : 'Open on 𝕏'}</Button></div>
      {view.conversationUnavailable && <Alert><AlertDescription>{tr ? 'Konuşma kaynağına erişilemiyor.' : 'Conversation is unavailable.'}</AlertDescription></Alert>}
      {view.conversation.map((post) => <div key={post.id} className="flex flex-col gap-5"><Separator /><PostBody post={post} locale={locale} /></div>)}
    </CardContent>
  </Card>;
}
