import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { getPostgresDraft } from "@/server/postgres-drafts";
import { attachPublicationReceipt, preparePublication, PUBLISHING_METHODS, type PublishingMethod } from "@/server/publishing-preparation";
export const runtime = "nodejs";
export const POST = withUser(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const denied = guardMutation(request); if (denied) return denied;
  const draftId = Number((await context.params).id);
  if (!await getPostgresDraft(draftId)) return Response.json({ error: "Draft not found" }, { status: 404 });
  try {
    const body = await readJsonBody(request);
    if (typeof body.preparationId === "string" && typeof body.url === "string") return Response.json(await attachPublicationReceipt(body.preparationId, body.url, draftId));
    if (!PUBLISHING_METHODS.includes(body.method as PublishingMethod)) return Response.json({ error: "Invalid publishing method" }, { status: 400 });
    return Response.json(await preparePublication(draftId, body.method as PublishingMethod));
  } catch { return Response.json({ error: "Hesap sahipliğini, taslağı ve gönderi bağlantısını kontrol edin." }, { status: 409 }); }
});
