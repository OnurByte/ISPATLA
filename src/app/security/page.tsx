import { PublicPage, PublicSection } from "@/components/public-page";

const title = "Security · ISPATLA";
const description = "ISPATLA’s boundaries for sessions, X connections, publishing permissions, token security, and vulnerability reports.";

export const metadata = {
  title,
  description,
  alternates: { canonical: "https://ispatla.tr/security" },
  robots: { index: true, follow: true },
  openGraph: { title, description, url: "https://ispatla.tr/security", locale: "en_US", type: "website" },
  twitter: { card: "summary", title, description },
};

export default function SecurityPage() {
  return <PublicPage title="Authorization is separate from evidence." summary="Sessions, X connections, publishing permission, and remote publishing results are checked independently.">
    <div className="space-y-10" lang="en">
      <PublicSection title="Account boundary"><p>Private drafts, jobs, usage, and X connections belong to the signed-in account. Typing an account’s identity manually does not grant permission to publish for it.</p><p>X tokens are stored encrypted and are not returned to the interface. Removing a connection stops local token use and refresh; the result of revocation on X is shown separately.</p></PublicSection>
      <PublicSection title="Submission boundary"><p>Current permission, account/topic/action stop settings, and publishing history are checked again immediately before submission. A persistent submission marker is kept for each post. An uncertain remote result is not automatically submitted again.</p><p>There is no automatic liking or direct messaging. A reply requires official evidence that the target author invoked the connected account. Unknown publishing permission remains disabled.</p></PublicSection>
      <PublicSection title="Report a vulnerability"><p>If you find a vulnerability, first ask the project maintainer for a private reporting channel. Do not include tokens, session cookies, private drafts, or working exploit details in a public issue.</p><p>Share the affected version, expected authorization boundary, and local reproduction steps without personal data. Clearly distinguish a local fixture result from a real remote result. The SECURITY file in the repository describes the reporting process.</p></PublicSection>
    </div>
    <aside lang="en" className="h-fit border-s-2 border-primary ps-5 text-sm leading-7 text-muted-foreground"><p className="font-semibold text-foreground">Review status</p><p className="mt-3">This version is in development. Local test and build evidence is separate from verification of live X, email delivery, and production deployment.</p></aside>
  </PublicPage>;
}
