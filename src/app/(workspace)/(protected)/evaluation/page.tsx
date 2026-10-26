import { EvaluationPage } from "@/components/evaluation-page";
import { PageHeading } from "@/components/page-heading";
import { renderUserPage } from "@/server/page-auth";

export const dynamic = "force-dynamic";

export default function EvaluationRoute() {
  return renderUserPage(() => <main className="min-h-screen"><div className="site-container flex flex-col gap-7 py-6 lg:py-10"><PageHeading eyebrow="Evidence / evaluation" title="Decision evaluation desk" description="Review overdue candidates, human labels, observed outcomes, and calibration evidence by account and model." /><EvaluationPage /></div></main>);
}
