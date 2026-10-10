import { sql } from "drizzle-orm";
import { metricBreakdown } from "@/server/scoring";
import { getPostgresDb } from "@/server/postgres";

export function parseAnalyticsParams(params: URLSearchParams): { accountId?: number; rangeDays: 7 | 14 } | null {
  const account = params.get("accountId");
  const range = params.get("rangeDays");
  if (account !== null && (!/^\d+$/.test(account) || !Number.isSafeInteger(Number(account)) || Number(account) < 1)) return null;
  if (range !== null && range !== "7" && range !== "14") return null;
  return { ...(account === null ? {} : { accountId: Number(account) }), rangeDays: range === "7" ? 7 : 14 };
}

export async function getPostgresAnalytics(owner: string, input: { accountId?: number; rangeDays: 7 | 14 }) {
  const db = getPostgresDb();
  const rangeStart = Math.floor(Date.now() / 1000) - input.rangeDays * 86400;
  if (input.accountId !== undefined) {
    const owned = await db.execute(sql`SELECT 1 FROM ispatla_app.accounts WHERE owner_user_id = ${owner} AND id = ${input.accountId} LIMIT 1`);
    if (!owned.rows.length) return null;
  }
  const accounts = await db.execute(sql`WITH owned_accounts AS (
    SELECT id, handle FROM ispatla_app.accounts
    WHERE owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND id = ${input.accountId}`}
  ), confirmed AS (
    SELECT DISTINCT account_id, post_external_id FROM ispatla_app.publish_attempts
    WHERE status = 'confirmed' AND account_id IN (SELECT id FROM owned_accounts) AND post_external_id <> ''
  ), latest_feedback AS (
    SELECT DISTINCT ON (post_external_id) id, post_external_id, likes, replies, reposts, quotes, views, poll_votes
    FROM ispatla_app.feedback_snapshots WHERE captured_at >= ${rangeStart} ORDER BY post_external_id, captured_at DESC, id DESC
  )
  SELECT a.id AS account_id, a.handle, COUNT(DISTINCT c.post_external_id)::int AS confirmed,
    COUNT(f.id)::int AS feedback, COALESCE(SUM(f.likes), 0)::bigint AS likes,
    COALESCE(SUM(f.replies), 0)::bigint AS replies, COALESCE(SUM(f.reposts), 0)::bigint AS reposts,
    COALESCE(SUM(f.quotes), 0)::bigint AS quotes, COALESCE(SUM(f.views), 0)::bigint AS views,
    COALESCE(SUM(f.poll_votes), 0)::bigint AS poll_votes,
    COALESCE((SELECT m.followers FROM ispatla_app.account_metric_snapshots m WHERE m.account_id = a.id ORDER BY m.captured_at DESC, m.id DESC LIMIT 1), 0)::bigint AS followers
  FROM owned_accounts a LEFT JOIN confirmed c ON c.account_id = a.id
  LEFT JOIN latest_feedback f ON f.post_external_id = c.post_external_id
  GROUP BY a.id, a.handle ORDER BY confirmed DESC, feedback DESC, a.handle`);
  const totals = await db.execute(sql`SELECT
    (SELECT COUNT(*)::int FROM ispatla_app.drafts d WHERE d.owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND d.account_id = ${input.accountId}`}) AS drafts,
    (SELECT COUNT(*)::int FROM ispatla_app.automation_jobs j JOIN ispatla_app.drafts d ON d.id = j.draft_id WHERE d.owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND j.account_id = ${input.accountId}`} AND j.status IN ('queued','running','submitted','pending_reconciliation')) AS queued,
    (SELECT COUNT(*)::int FROM ispatla_app.automation_jobs j JOIN ispatla_app.drafts d ON d.id = j.draft_id WHERE d.owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND j.account_id = ${input.accountId}`} AND j.status = 'confirmed') AS confirmed,
    (SELECT COUNT(*)::int FROM ispatla_app.automation_jobs j JOIN ispatla_app.drafts d ON d.id = j.draft_id WHERE d.owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND j.account_id = ${input.accountId}`} AND j.status = 'blocked') AS blocked,
    (SELECT COUNT(*)::int FROM ispatla_app.automation_jobs j JOIN ispatla_app.drafts d ON d.id = j.draft_id WHERE d.owner_user_id = ${owner} ${input.accountId === undefined ? sql`` : sql`AND j.account_id = ${input.accountId}`} AND j.status = 'failed') AS failed,
    (SELECT COUNT(DISTINCT f.id)::int FROM ispatla_app.feedback_snapshots f JOIN ispatla_app.publish_attempts p ON p.post_external_id = f.post_external_id JOIN ispatla_app.accounts a ON a.id = p.account_id WHERE a.owner_user_id = ${owner} AND f.captured_at >= ${rangeStart} ${input.accountId === undefined ? sql`` : sql`AND a.id = ${input.accountId}`}) AS feedback`);
  const accountPerformance = (accounts.rows as Array<Record<string, unknown>>).map((row) => ({
    accountId: Number(row.account_id), handle: String(row.handle), confirmed: Number(row.confirmed), feedback: Number(row.feedback),
    followers: Number(row.followers), metrics: metricBreakdown(row as Parameters<typeof metricBreakdown>[0]),
  }));
  const count = (key: string) => Number((totals.rows[0] as Record<string, unknown>)?.[key] ?? 0);
  return {
    drafts: count("drafts"), queued: count("queued"), confirmed: count("confirmed"), blocked: count("blocked"), failed: count("failed"), feedback: count("feedback"),
    totalFollowers: accountPerformance.reduce((sum, account) => sum + account.followers, 0), accountPerformance,
    rangeDays: input.rangeDays, selectedAccountId: input.accountId ?? null,
    countScope: { draftsAndJobs: "lifetime", feedbackAndAccountMetricsDays: input.rangeDays },
    // Detailed historical breakdowns need the legacy metric, competitor, and AI usage stores.
    parity: "publishing_summary_only",
  };
}
