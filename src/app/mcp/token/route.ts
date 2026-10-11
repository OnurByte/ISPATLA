import { issueMcpTokens, readMcpForm } from "@/server/mcp-authorization";
export const runtime="nodejs";
export async function POST(request:Request) { try { return Response.json(await issueMcpTokens(await readMcpForm(request)),{headers:{"cache-control":"no-store","pragma":"no-cache"}}); } catch { return Response.json({error:"invalid_grant"},{status:400,headers:{"cache-control":"no-store"}}); } }
