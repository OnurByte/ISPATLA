import { registerMcpClient } from "@/server/mcp-authorization";
import { readBoundedBody } from "@/server/api-guard";
export const runtime="nodejs";
export async function POST(request:Request) { try { const text=await readBoundedBody(request,16384); return Response.json(await registerMcpClient(JSON.parse(text)),{status:201,headers:{"cache-control":"no-store"}}); } catch { return Response.json({error:"invalid_client_metadata"},{status:400}); } }
