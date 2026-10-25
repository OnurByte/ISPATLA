import { withUser } from "@/server/request-auth";
import { guardMutation, readJsonBody } from "@/server/api-guard";
import { setPostgresSetting } from "@/server/postgres-settings";
export const runtime = "nodejs";
export const POST = withUser(async (request: Request, context: { params: Promise<{ postId: string }> }) => {
  const denied = guardMutation(request); if (denied) return denied;
  const { postId } = await context.params;
  if (!/^\d{1,19}$/.test(postId)) return Response.json({ error: "Invalid post ID" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await readJsonBody(request); } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }
  if (typeof body.saved !== "boolean") return Response.json({ error: "Invalid saved state" }, { status: 400 });
  await setPostgresSetting(`saved_post:${postId}`, body.saved ? "1" : "0");
  return Response.json({ saved: body.saved }, { headers: { "cache-control": "no-store" } });
});
