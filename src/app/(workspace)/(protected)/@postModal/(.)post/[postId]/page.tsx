import PostPage from "../../../post/[postId]/page";
import { PostModal } from "@/components/post-modal";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";
export const dynamic = "force-dynamic";
export default async function ModalPage(props: Parameters<typeof PostPage>[0]) {
  const locale = await requestPublicLocale();
  return <PostModal title={getUiText(locale, "Post viewer")}>{await PostPage(props)}</PostModal>;
}
