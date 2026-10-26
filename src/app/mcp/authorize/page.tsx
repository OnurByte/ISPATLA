import { BrandText } from "@/components/brand-text";
import { requirePageUser } from "@/server/page-auth";
import { beginMcpAuthorization } from "@/server/mcp-authorization";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestPublicLocale } from "@/components/public-header";
import { LOCALE_CONFIG } from "@/i18n/config";
import { getUiText } from "@/i18n/ui";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await requestPublicLocale();
  const language = LOCALE_CONFIG[locale];
  const t = (message: string, params?: Record<string, string | number>) => getUiText(locale, message, params);
  const user = await requirePageUser();
  const values = await searchParams;
  const params = new URLSearchParams(Object.entries(values).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  let authorization;
  try { authorization = await beginMcpAuthorization(user.id, params); }
  catch { return <main lang={locale} dir={language.dir} className="mx-auto max-w-xl p-6"><Alert><AlertDescription>{t("Invalid or expired authorization request. Return to your MCP client and reconnect.")}</AlertDescription></Alert></main>; }
  return <main lang={locale} dir={language.dir} className="mx-auto max-w-xl p-6"><Card><CardHeader><CardTitle><BrandText text={t("Connect to ispatla.tr")} /></CardTitle><CardDescription>{t("{name} requests access to your ispatla.tr account.", { name: authorization.name })}</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><p className="text-sm">{t("Signed in as {email}. Access applies only to your account.", { email: user.email })}</p><ul className="list-inside list-disc text-sm">{authorization.scope.split(" ").map((scope) => <li key={scope}>{scope}</li>)}</ul><p className="text-sm text-muted-foreground">{t("Agents cannot confirm account ownership or authorize automatic publishing. You can revoke access in Security settings.")}</p><p className="break-all text-sm text-muted-foreground">{t("Return address:")} {authorization.redirectUri}</p><form action="/mcp/consent" method="post" className="flex gap-3"><input type="hidden" name="id" value={authorization.id} /><Button type="submit" name="decision" value="approve">{t("Allow access")}</Button><Button type="submit" variant="outline" name="decision" value="deny">{t("Decline")}</Button></form></CardContent></Card></main>;
}
