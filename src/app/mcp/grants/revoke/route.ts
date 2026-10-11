import { sql } from "drizzle-orm";
import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { getPostgresDb } from "@/server/postgres";
import { readMcpForm, mcpOrigin } from "@/server/mcp-authorization";
export const runtime = "nodejs";
export const POST = withUser(async (request: Request) => {
  const denied = guardMutation(request); if (denied) return denied;
  let id: string;
  try { id = (await readMcpForm(request)).get("id") || ""; } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!/^[a-f0-9-]{36}$/.test(id)) return Response.json({ error: "Invalid grant ID" }, { status: 400 });
  await getPostgresDb().execute(sql`UPDATE ispatla_app.mcp_grants SET revoked_at=${Math.floor(Date.now() / 1000)} WHERE id=${id} AND owner_user_id=${currentOwnerId()!}`);
  return Response.redirect(`${mcpOrigin()}/settings/security`, 303);
});
