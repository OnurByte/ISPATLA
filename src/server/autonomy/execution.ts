import { getAccountCategoryConfigs, getAccounts, getDraft } from "@/server/db";
import { currentOwnerId } from "@/server/owner-context";
import { confirmedAutonomyAuthorization, demoteScopedAutonomy, getAutonomyEvidence, listSourceCandidateEvaluationPredictions, type AutonomyScope } from "@/server/evaluation-store";

export type AutomaticSendInput = { draftId:number; accountId:number; action:"post"|"repost"|"reply" };
type Resolved = { scope:AutonomyScope; draftId:number; candidateId:string };

function resolve(input:AutomaticSendInput,checkRisk=true):Resolved {
  const owner=currentOwnerId();
  if(!owner||!Number.isSafeInteger(input.draftId)||!Number.isSafeInteger(input.accountId))throw new Error("automatic send owner and identifiers are required");
  const account=getAccounts().find(row=>row.id===input.accountId&&row.ownerUserId===owner&&row.enabled);
  const draft=getDraft(input.draftId);
  if(!account||!draft||draft.accountId!==account.id||draft.format!==input.action||!draft.externalId||!draft.evaluation?.categorySlug)throw new Error("automatic send classification is unavailable");
  const category=draft.evaluation.categorySlug;
  if(!getAccountCategoryConfigs(account.id).some(row=>row.enabled&&row.categorySlug===category))throw new Error("automatic send category is not enabled for account");
  if(checkRisk){
    const predictions=listSourceCandidateEvaluationPredictions(String(account.id),draft.externalId);
    if(!predictions.length||predictions.some(row=>row.action!==input.action||row.category!==category||row.riskTier!=="low"||row.features.decision!=="eligible"))throw new Error("automatic send has unknown, conflicting, or high-risk classification");
  }
  return {scope:{accountId:String(account.id),action:input.action,category,riskTier:"low"},draftId:draft.id,candidateId:draft.externalId};
}

/** Call at the final send boundary; consent and a caller-supplied risk label cannot enable execution. */
export function authorizeAutomaticSend(input:AutomaticSendInput):void {
  const {scope,candidateId}=resolve(input);
  const confirmed=confirmedAutonomyAuthorization(scope);
  if(!confirmed)throw new Error("exact-scope user-confirmed autonomy is required");
  const predictions=listSourceCandidateEvaluationPredictions(scope.accountId,candidateId);
  if(predictions.some(row=>row.modelKey!==confirmed.modelKey||row.selectorVersion!==confirmed.selectorVersion))throw new Error("automatic send decision does not match the accepted model pin");
  const evidence=getAutonomyEvidence(scope);
  if(evidence.modelKey!==confirmed.modelKey||evidence.selectorVersion!==confirmed.selectorVersion)throw new Error("automatic send model pin is no longer active");
  if(evidence.cleanApprovals<30||evidence.policyFailures||evidence.authFailures||evidence.duplicateIncidents||evidence.unacceptableOutcomes)throw new Error("autonomy evidence no longer qualifies or contains incidents");
}

export function demoteAutomaticExecution(input:AutomaticSendInput & {reason:"policy_failure"|"auth_uncertainty"|"duplicate_risk"|"unacceptable_outcome";now:number}):boolean {
  const {scope}=resolve(input,false);
  return demoteScopedAutonomy({...scope,reason:input.reason,now:input.now});
}
