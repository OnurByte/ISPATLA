import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PostDetail } from "@/components/post-detail";
import { getPostView } from "@/server/post-view";
import { renderUserPage } from "@/server/page-auth";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PostPage({ params, searchParams }: { params: Promise<{ postId: string }>; searchParams: Promise<{ conversation?: string }> }) {
  return renderUserPage(async () => {
    const { postId } = await params;
    if (!/^\d{1,19}$/.test(postId)) notFound();
    const view = await getPostView(postId, (await searchParams).conversation === "1");
    if (!view) notFound();
    const locale = (await headers()).get("x-ispatla-locale") || DEFAULT_LOCALE;
    return <PostDetail view={view} locale={isLocale(locale) ? locale : DEFAULT_LOCALE} />;
  });
}
