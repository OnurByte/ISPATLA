import { PublicPage, PublicSection } from "@/components/public-page";

const title = "Terms and limits · ISPATLA";
const description = "ISPATLA’s limits, publishing responsibilities, official X API conditions, and open-source license.";

export const metadata = {
  title,
  description,
  alternates: { canonical: "https://ispatla.tr/terms" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "https://ispatla.tr/terms", locale: "en_US", type: "website" },
  twitter: { card: "summary", title, description },
};

export default function TermsPage() {
  return <PublicPage title="Your decision. Clear limits." summary="ISPATLA supports research and publishing decisions. It does not guarantee access, virality, income, or correct classification.">
    <div className="space-y-10" lang="en">
      <PublicSection title="Publishing responsibility"><p>Before publishing, review the source, text, target account, and rights to use any media. An AI draft or decision score is not proof of accuracy. Source content cannot instruct the application.</p><p>Connect only accounts you are authorized to use. Review permission scopes and publishing preferences explicitly. An automation preference does not override platform rules or account authorization limits.</p></PublicSection>
      <PublicSection title="X and provider limits"><p>Current X API terms, plan permissions, and rate limits may restrict publishing. If permission is unknown, the application keeps the action disabled. Acceptance of a request by the official API does not mean the post was verified remotely.</p><p>Do not retry a submission with an uncertain result, as that may create a duplicate. Review its receipt and verification status; if needed, refresh the connection or use the review queue.</p></PublicSection>
      <PublicSection title="Local installation and source code"><p>The source code is offered under the AGPL-3.0-or-later license; the full license text is in the repository’s LICENSE file. Third-party packages retain their own license terms.</p><p>The installation operator must separately set hosting, provider costs, data retention, and support terms. This technical limits page makes no pricing, SLA, or subscription promises for any hosted service.</p></PublicSection>
    </div>
    <aside lang="en" className="h-fit border-s-2 border-primary ps-5 text-sm leading-7 text-muted-foreground"><p className="font-semibold text-foreground">Development version</p><p className="mt-3">Live publishing and production acceptance are verified separately from local tests. The current version’s limits are documented.</p></aside>
  </PublicPage>;
}
