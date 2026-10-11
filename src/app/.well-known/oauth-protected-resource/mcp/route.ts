import { mcpOrigin, MCP_SCOPES } from "@/server/mcp-authorization";
export function GET() { const origin=mcpOrigin(); return Response.json({ resource:`${origin}/mcp`, authorization_servers:[origin], scopes_supported:MCP_SCOPES, bearer_methods_supported:["header"] }); }
