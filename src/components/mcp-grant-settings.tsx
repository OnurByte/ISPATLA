import { sql } from "drizzle-orm";
import { getPostgresDb } from "@/server/postgres";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requestPublicLocale } from "@/components/public-header";
import { getUiText } from "@/i18n/ui";
export async function McpGrantSettings({ owner }: { owner: string }) {
  const locale = await requestPublicLocale();
  const t = (message: string) => getUiText(locale, message);
  const result = await getPostgresDb().execute(sql`SELECT g.id,g.scope,c.name FROM ispatla_app.mcp_grants g JOIN ispatla_app.mcp_clients c ON c.id=g.client_id WHERE g.owner_user_id=${owner} AND g.revoked_at IS NULL AND g.refresh_expires_at>${Math.floor(Date.now() / 1000)}`);
  return <Card><CardHeader><CardTitle>{t("Agent connections")}</CardTitle><CardDescription>{t("Add /mcp to your client. Each client receives its own revocable access.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">{result.rows.length ? result.rows.map((row) => <form key={String(row.id)} action="/mcp/grants/revoke" method="post" className="flex items-center justify-between gap-3"><input type="hidden" name="id" value={String(row.id)} /><div><p className="font-medium">{String(row.name)}</p><p className="text-sm text-muted-foreground">{String(row.scope)}</p></div><Button type="submit" variant="outline">{t("Revoke access")}</Button></form>) : <p className="text-sm text-muted-foreground">{t("No active agent connections.")}</p>}</CardContent></Card>;
}
