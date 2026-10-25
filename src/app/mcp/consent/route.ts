import { withUser } from "@/server/request-auth";
import { guardMutation } from "@/server/api-guard";
import { currentOwnerId } from "@/server/owner-context";
import { approveMcpAuthorization, readMcpForm } from "@/server/mcp-authorization";
export const runtime="nodejs";
export const POST=withUser(async(request:Request)=>{ const denied=guardMutation(request); if(denied) return denied; try { const body=await readMcpForm(request); const target=await approveMcpAuthorization(currentOwnerId()!,body.get("id")||"",body.get("decision")==="approve"); return Response.redirect(target,303); } catch { return Response.json({error:"Authorization request expired or unavailable"},{status:400}); } });
