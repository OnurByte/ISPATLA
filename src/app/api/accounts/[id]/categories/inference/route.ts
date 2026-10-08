import { withUser } from "@/server/request-auth";
import { getOwnAccountInference } from "@/server/db";
import { runAccountCategoryInference } from "@/server/account-inference";
import { guardMutation, readJsonBody } from "@/server/api-guard";

export const runtime = "nodejs";

async function GETHandler(_request: Request, context: { params: Promise<{ id: string }> }) {
  const accountId = Number((await context.params).id);
  try { return Response.json(getOwnAccountInference(accountId), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ error: "Hesap bulunamadı" }, { status: 404 }); }
}

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guardMutation(request);
  if (denied) return denied;
  const accountId = Number((await context.params).id);
  try {
    const body = await readJsonBody(request);
    const result = await runAccountCategoryInference({ accountId, regenerate: body.regenerate === true });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hesap analizi tamamlanamadı" }, { status: 422 });
  }
}

export const GET = withUser(GETHandler);
export const POST = withUser(POSTHandler);
