import { PublicPage, PublicSection } from "@/components/public-page";
import { requestPublicLocale } from "@/components/public-header";
import { LOCALE_CONFIG } from "@/i18n/config";
import { getUiText } from "@/i18n/ui";
import { publicMetadata } from "@/i18n/public-metadata";

export async function generateMetadata() {
  const locale = await requestPublicLocale();
  const t = (message: string) => getUiText(locale, message);
  return publicMetadata(locale, "/terms", t("Terms ⁜ ispatla.tr"), t("ispatla.tr supports research and publishing decisions. It does not guarantee reach, virality, income or correct classification."));
}

export default async function TermsPage() {
  const locale = await requestPublicLocale();
  const language = LOCALE_CONFIG[locale];
  const t = (message: string) => getUiText(locale, message);
  return <PublicPage title={t("Your decision, clear boundaries.")} summary={t("ispatla.tr supports research and publishing decisions. It does not guarantee reach, virality, income or correct classification.")}>
    <div lang={locale} dir={language.dir} className="space-y-10">
      <PublicSection title={t("Publishing responsibility")}>
        <p>{t("Before publishing, review the source, wording, target account and rights to use any media. An AI draft or decision score is not proof of truth. Source content cannot instruct the application.")}</p>
        <p>{t("Only connect accounts you are authorized to use. Review permission scopes and publishing preferences clearly. An automation preference does not override platform rules or account permission boundaries.")}</p>
      </PublicSection>
      <PublicSection title={t("Platform and provider limits")}>
        <p>{t("Current 𝕏 API terms, plan permissions and rate limits may restrict publishing. If permission is unknown, the application keeps the action disabled. Acceptance of a request by the official API does not mean the publication was verified remotely.")}</p>
        <p>{t("Do not repeat a submission with an uncertain result. Review the receipt and verification status; if needed, refresh the connection or use the review queue.")}</p>
      </PublicSection>
      <PublicSection title={t("Local installation and source code")}>
        <p>{t("The source code is provided under the AGPL-3.0-or-later license; the full license text is in the repository's LICENSE file. Third-party package licenses retain their own terms.")}</p>
        <p>{t("The installation operator must set hosting, provider costs, data retention and support conditions separately. This technical-use page makes no price, SLA or subscription promise for a particular hosted service.")}</p>
      </PublicSection>
    </div>
    <aside lang={locale} dir={language.dir} className="h-fit border-s-2 border-primary ps-5 text-sm leading-7 text-muted-foreground">
      <p className="font-semibold text-foreground">{t("Development version")}</p>
      <p className="mt-3">{t("Live publishing and production acceptance are verified separately from local tests. The current version's boundaries remain visible in the documentation.")}</p>
    </aside>
  </PublicPage>;
}
