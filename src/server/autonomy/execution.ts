import { sql } from "drizzle-orm";
import { getPostgresAccount, getPostgresCategoryConfigs } from "@/server/postgres-accounts";
import { getPostgresDraft } from "@/server/postgres-drafts";
import { getPostgresDb } from "@/server/postgres";
import { currentOwnerId } from "@/server/owner-context";
import { confirmedAutonomyAuthorization, demoteScopedAutonomy, getAutonomyEvidence, listSourceCandidateEvaluationPredictions, type AutonomyScope } from "@/server/evaluation-store";

export type AutomaticSendInput = { draftId:number; accountId:number; action:"post"|"repost"|"reply" };
type Resolved = { scope:AutonomyScope; draftId:number; candidateId:string };

async function resolve(input:AutomaticSendInput,checkRisk=true):Promise<Resolved> {
  const owner=currentOwnerId();
  if(!owner||!Number.isSafeInteger(input.draftId)||!Number.isSafeInteger(input.accountId))throw new Error("automatic send owner and identifiers are required");
  const [account,draft]=await Promise.all([getPostgresAccount(owner,input.accountId),getPostgresDraft(input.draftId)]);
  const [evaluation] = draft ? (await getPostgresDb().execute(sql`SELECT evaluation.category_slug AS "categorySlug"
    FROM ispatla_app.draft_evaluations evaluation
    JOIN ispatla_app.drafts owned_draft ON owned_draft.id=evaluation.draft_id
    WHERE owned_draft.owner_user_id=${owner} AND evaluation.draft_id=${input.draftId} AND evaluation.account_id=${input.accountId}
    LIMIT 1`)).rows as Array<{categorySlug:string}> : [];
  if(!account?.enabled||!draft||draft.accountId!==account.id||draft.format!==input.action||!draft.externalId||!evaluation?.categorySlug)throw new Error("automatic send classification is unavailable");
  const category=evaluation.categorySlug;
  if(!(await getPostgresCategoryConfigs(owner,account.id)).some(row=>row.enabled&&row.categorySlug===category))throw new Error("automatic send category is not enabled for account");
  if(checkRisk){
    const predictions=await listSourceCandidateEvaluationPredictions(String(account.id),draft.externalId);
    if(!predictions.length||predictions.some(row=>row.action!==input.action||row.category!==category||row.riskTier!=="low"||row.features.decision!=="eligible"))throw new Error("automatic send has unknown, conflicting, or high-risk classification");
  }
  return {scope:{accountId:String(account.id),action:input.action,category,riskTier:"low"},draftId:draft.id,candidateId:draft.externalId};
}

/** Call at the final send boundary; consent and a caller-supplied risk label cannot enable execution. */
export async function authorizeAutomaticSend(input:AutomaticSendInput):Promise<void> {
  const {scope,candidateId}=await resolve(input);
  const confirmed=await confirmedAutonomyAuthorization(scope);
  if(!confirmed)throw new Error("exact-scope user-confirmed autonomy is required");
  const predictions=await listSourceCandidateEvaluationPredictions(scope.accountId,candidateId);
  if(predictions.some(row=>row.modelKey!==confirmed.modelKey||row.selectorVersion!==confirmed.selectorVersion))throw new Error("automatic send decision does not match the accepted model pin");
  const evidence=await getAutonomyEvidence(scope);
  if(evidence.modelKey!==confirmed.modelKey||evidence.selectorVersion!==confirmed.selectorVersion)throw new Error("automatic send model pin is no longer active");
  if(evidence.cleanApprovals<30||evidence.policyFailures||evidence.authFailures||evidence.duplicateIncidents||evidence.unacceptableOutcomes)throw new Error("autonomy evidence no longer qualifies or contains incidents");
}

export async function demoteAutomaticExecution(input:AutomaticSendInput & {reason:"policy_failure"|"auth_uncertainty"|"duplicate_risk"|"unacceptable_outcome";now:number}):Promise<boolean> {
  const {scope}=await resolve(input,false);
  return demoteScopedAutonomy({...scope,reason:input.reason,now:input.now});
}
