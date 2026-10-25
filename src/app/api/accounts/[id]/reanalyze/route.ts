import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { analyzeLinkedAccount } from "@/server/account-link";
export const runtime = "nodejs";
export const POST = withUser(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const denied = guardMutation(request, true); if (denied) return denied;
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid account ID" }, { status: 400 });
  try { return Response.json(await analyzeLinkedAccount(id), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Account operation failed. Check the profile and retry." }, { status: 409 }); }
});
