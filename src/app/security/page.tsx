import { PublicPage, PublicSection } from "@/components/public-page";
import { requestPublicLocale } from "@/components/public-header";
import { LOCALE_CONFIG } from "@/i18n/config";
import { getUiText } from "@/i18n/ui";
import { publicMetadata } from "@/i18n/public-metadata";

export async function generateMetadata() {
  const locale = await requestPublicLocale();
  const t = (message: string) => getUiText(locale, message);
  return publicMetadata(locale, "/security", t("Security ⁜ ispatla.tr"), t("Session, 𝕏 connection, publishing permission and the result of a remote publication are checked independently."));
}

export default async function SecurityPage() {
  const locale = await requestPublicLocale();
  const language = LOCALE_CONFIG[locale];
  const t = (message: string) => getUiText(locale, message);
  return <PublicPage title={t("Authorization is separate from proof.")} summary={t("Session, 𝕏 connection, publishing permission and the result of a remote publication are checked independently.")}>
    <div lang={locale} dir={language.dir} className="space-y-10">
      <PublicSection title={t("Account boundary")}>
        <p>{t("Private drafts, jobs, usage and the 𝕏 connection belong to the signed-in user. Manually entering an account identity does not grant permission to publish for that account.")}</p>
        <p>{t("𝕏 tokens are stored encrypted and are not exposed to the interface. Disconnecting stops local use and renewal of the token; the result of revocation on 𝕏 is shown separately.")}</p>
      </PublicSection>
      <PublicSection title={t("Submission boundary")}>
        <p>{t("Current permission, account/topic/action stop settings and publication history are checked again immediately before sending. A durable sending marker is kept for each submission. An uncertain remote result is not automatically sent again.")}</p>
        <p>{t("There are no automatic likes or DMs. A reply requires official proof that the target author called the connected account. Unknown publishing permission stays off.")}</p>
      </PublicSection>
      <PublicSection title={t("Security report")}>
        <p>{t("If you find a vulnerability, first ask the project maintainer for a private reporting channel. Do not include tokens, session cookies, private drafts or working exploit details in a public issue.")}</p>
        <p>{t("Share the affected version, expected permission boundary and local reproduction steps that contain no personal data. Clearly distinguish a local fixture result from a real remote result. The repository's SECURITY file describes the reporting process.")}</p>
      </PublicSection>
    </div>
    <aside lang={locale} dir={language.dir} className="h-fit border-s-2 border-primary ps-5 text-sm leading-7 text-muted-foreground">
      <p className="font-semibold text-foreground">{t("Review status")}</p>
      <p className="mt-3">{t("This version is in development. Local test and build evidence is kept separate from verification of live 𝕏, email delivery and production deployment.")}</p>
    </aside>
  </PublicPage>;
}
