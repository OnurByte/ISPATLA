import PostPage from "../../../post/[postId]/page";
import { PostModal } from "@/components/post-modal";
import { headers } from "next/headers";
export const dynamic = "force-dynamic";
export default async function ModalPage(props: Parameters<typeof PostPage>[0]) {
  const tr = (await headers()).get("x-ispatla-locale") === "tr";
  return <PostModal title={tr ? "Gönderi inceleyici" : "Post viewer"}>{await PostPage(props)}</PostModal>;
}
