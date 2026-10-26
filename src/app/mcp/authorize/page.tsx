import { BrandText } from "@/components/brand-text";
import { requirePageUser } from "@/server/page-auth";
import { beginMcpAuthorization } from "@/server/mcp-authorization";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser();
  const values = await searchParams;
  const params = new URLSearchParams(Object.entries(values).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  let authorization;
  try { authorization = await beginMcpAuthorization(user.id, params); }
  catch { return <main className="mx-auto max-w-xl p-6"><Alert><AlertDescription>Invalid or expired authorization request. Return to your MCP client and reconnect.</AlertDescription></Alert></main>; }
  return <main className="mx-auto max-w-xl p-6"><Card><CardHeader><CardTitle><BrandText text="Connect to ispatla.tr" /></CardTitle><CardDescription><BrandText text={`${authorization.name} requests access to your ispatla.tr account.`} /></CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><p className="text-sm">Signed in as {user.email}. Access applies only to your account.</p><ul className="list-inside list-disc text-sm">{authorization.scope.split(" ").map((scope) => <li key={scope}>{scope}</li>)}</ul><p className="text-sm text-muted-foreground">Agents cannot confirm account ownership or authorize automatic publishing. You can revoke access in Security settings.</p><p className="break-all text-sm text-muted-foreground">Return address: {authorization.redirectUri}</p><form action="/mcp/consent" method="post" className="flex gap-3"><input type="hidden" name="id" value={authorization.id} /><Button type="submit" name="decision" value="approve">Allow access</Button><Button type="submit" variant="outline" name="decision" value="deny">Decline</Button></form></CardContent></Card></main>;
}
