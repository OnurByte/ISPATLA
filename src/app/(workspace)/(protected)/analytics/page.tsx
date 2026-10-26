import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeading } from "@/components/page-heading";
import { UiText } from "@/i18n/ui-client";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function AnalyticsRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10">
    <PageHeading eyebrow="Measurement / feedback" title="Account analytics" description="Performance across accounts, publishing, and public snapshots." />
    <Alert><AlertDescription><UiText text="Historical analytics have not yet been migrated to PostgreSQL. They will appear here after migration; no historical results are shown yet." /></AlertDescription></Alert>
  </div></main>);
}
