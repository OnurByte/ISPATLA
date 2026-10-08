import { confirmAutonomySuggestion, createAutonomySuggestion, demoteScopedAutonomy, getAutonomyEvidence, isScopedAutonomyEnabled, type AutonomyEvidence, type AutonomyModelPin, type AutonomyScope } from "@/server/evaluation-store";

const MIN_CLEAN_APPROVALS = 30;
export type AutonomyEvidenceInput = AutonomyEvidence;

/** Proposes only low-risk action shapes with substantial clean history; it never enables execution. */
export function suggestScopedAutonomy(input:AutonomyEvidenceInput):{suggested:boolean;suggestionId?:string;reason:"eligible"|"insufficient_history"|"risk_tier"|"incident"} {
  if(input.riskTier!=="low")return {suggested:false,reason:"risk_tier"};
  const evidence=getAutonomyEvidence(input);
  if(evidence.policyFailures||evidence.authFailures||evidence.duplicateIncidents||evidence.unacceptableOutcomes)return {suggested:false,reason:"incident"};
  if(evidence.cleanApprovals<MIN_CLEAN_APPROVALS)return {suggested:false,reason:"insufficient_history"};
  const suggestionId=createAutonomySuggestion(input);
  return {suggested:true,suggestionId,reason:"eligible"};
}

/** A separate call records the user's explicit confirmation for this exact scope. */
export function confirmScopedAutonomy(suggestionId:string,now:number,expectedEvidenceHash?:string,expectedAccountId?:string):AutonomyScope & AutonomyModelPin {
  return confirmAutonomySuggestion(suggestionId,now,expectedEvidenceHash,expectedAccountId);
}

export function scopedAutonomyEnabled(scope:AutonomyScope):boolean { return isScopedAutonomyEnabled(scope); }
export function demoteAutonomyAfterIncident(input:AutonomyScope & {reason:"policy_failure"|"auth_uncertainty"|"duplicate_risk"|"unacceptable_outcome"|"user_requested";now:number}):boolean {
  return demoteScopedAutonomy(input);
}
