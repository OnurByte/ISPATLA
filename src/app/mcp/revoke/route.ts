import { revokeMcpToken, readMcpForm } from "@/server/mcp-authorization";
export const runtime="nodejs";
export async function POST(request:Request) { try { await revokeMcpToken(await readMcpForm(request)); return new Response(null,{status:200,headers:{"cache-control":"no-store"}}); } catch { return Response.json({error:"invalid_request"},{status:400}); } }
