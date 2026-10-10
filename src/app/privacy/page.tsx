import { PublicPage, PublicSection } from "@/components/public-page";
import { measurementPrivacy } from "@/i18n/measurement-privacy";

const title = "Privacy · ISPATLA";
const description = "How ISPATLA handles data flows, sessions, X connections, profile visibility, and data retention.";

export const metadata = {
  title,
  description,
  alternates: { canonical: "https://ispatla.tr/privacy" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "https://ispatla.tr/privacy", locale: "en_US", type: "website" },
  twitter: { card: "summary", title, description },
};

export default async function PrivacyPage() {
  const measurement = measurementPrivacy.en;
  return <PublicPage title="See where your data goes." summary="This page describes the current version’s data flows. The operator of your installation should separately explain its hosting and retention conditions.">
    <div className="space-y-10" lang="en">
      <PublicSection title={measurement[0]}><p>{measurement[1]}</p></PublicSection>
      <PublicSection title="Sessions and private workspace"><p>The application stores email, password-verification information, and session records. The private workspace contains account settings, drafts, revisions, publishing jobs, receipts, and evaluation records. These belong to the signed-in account.</p><p>The session cookie keeps you signed in. Signing out revokes the session. Email verification and password-reset messages are delivered through the email provider selected for the installation.</p></PublicSection>
      <PublicSection title="X and source data"><p>The source radar stores selected public X posts, their links, and the metrics currently available. These source observations are shared research data. A metric missing from a source post is never filled with an invented value.</p><p>When you connect an X account, its official user ID, permission scopes, and encrypted tokens are stored. Tokens are not shown to clients. You can manage permissions and remove the connection in account settings.</p></PublicSection>
      <PublicSection title="Shared profile"><p>The connected X account supplies your display name, bio, username, and profile photo. Visibility follows whether the X account is private or public, and you cannot edit these details in ISPATLA. The profile photo is stored by this installation. After your profile is complete, if your X profile is private, your ISPATLA page also stays private. Sharing your profile does not publish private drafts or unpublished posts.</p></PublicSection>
      <PublicSection title="External services"><p>Source reads go through the configured X reader; connection, publishing, and verification requests go to the official X API. When AI draft generation is used, source context, account style, and task data may be sent to the selected provider. Provider selection and key use depend on account and installation settings.</p><p>The local demo uses synthetic data and disables official X requests. Its demo database is removed when the session ends.</p></PublicSection>
      <PublicSection title="Retention and requests"><p>The installation operator controls the database and backups. This version does not provide a self-service export or deletion screen for all account data. Contact the operator of your installation about retention, access, or account-data requests.</p><p>Do not share tokens, session details, or private drafts in public support channels.</p></PublicSection>
    </div>
    <aside lang="en" className="h-fit rounded-lg border p-5 text-sm leading-7 text-muted-foreground"><p className="font-semibold text-foreground">Connection and publishing permission</p><p className="mt-3">X OAuth permission and automation preferences are recorded separately. You can review and revoke each permission.</p></aside>
  </PublicPage>;
}
