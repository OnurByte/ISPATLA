import { createMcpHandler } from "@modelcontextprotocol/server";
import { createIspatlaMcpServer } from "@/server/mcp";
import { mcpOrigin, resolveMcpBearer, authorizeMcpTool, admitMcp } from "@/server/mcp-authorization";
import { readBoundedBody } from "@/server/api-guard";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handler(request:Request) {
  const origin=mcpOrigin();
  if((request.headers.get("host") || new URL(request.url).host).toLowerCase()!==new URL(origin).host.toLowerCase() || (request.headers.get("origin") && request.headers.get("origin")!==origin)) return Response.json({error:"Invalid origin"},{status:403});
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization")||"")?.[1]||"";
  const grant=await resolveMcpBearer(token);
  if(!grant) return Response.json({error:"Authentication required"},{status:401,headers:{"www-authenticate":`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,"cache-control":"no-store"}});
  try { await admitMcp(`requests:${grant.owner}`,100); } catch { return Response.json({error:"Rate limit exceeded"},{status:429,headers:{"retry-after":"60"}}); }
  if(Number(request.headers.get("content-length")||0)>1048576) return Response.json({error:"Request too large"},{status:413});
  if(request.method!=="POST") return new Response(null,{status:405,headers:{allow:"POST"}});
  let text:string;
  try { text=await readBoundedBody(request,1048576); } catch { return Response.json({error:"Request too large"},{status:413}); }
  const bounded=new Request(request.url,{method:"POST",headers:request.headers,body:text});
  const transport=createMcpHandler(()=>createIspatlaMcpServer({resolveSession:async()=>{ const current=await resolveMcpBearer(token); return current?{user:{id:current.owner}}:null; },authorizeTool:(name,readOnly)=>authorizeMcpTool(grant.scope,name,readOnly)}));
  return transport.fetch(bounded);
}
export const POST=handler;
export const GET=handler;
