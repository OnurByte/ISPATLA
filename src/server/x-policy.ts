import { createHash } from 'node:crypto';

export const X_POLICY_VERSION = '2026-10-08.1';
export const X_CONSENT_COPY_VERSION = '1';
export type XAction = 'post' | 'repost' | 'reply' | 'quote' | 'media';
export type PolicyDecision = { allowed: boolean; version: string; reasons: string[]; fingerprint: string };
export type PolicyEvidence = {
  action: string; automatic: boolean; mode: 'observe' | 'assist' | 'auto';
  accountId: number; now: number; text: string; sourceText?: string; clusterId?: string;
  sourceHandle?: string; targetAuthorAccountId?: number; targetId?: string;
  grantConnected: boolean; capabilities: readonly string[]; quoteEntitled?: boolean;
  humanApproved?: boolean; optedOut?: boolean; sensitive?: boolean; mediaRightsCleared?: boolean;
  trigger?: 'source_graph' | 'event' | 'manual' | 'x_trending_topic';
  kills?: { global?: boolean; account?: boolean; category?: boolean; actions?: readonly string[] };
  consent?: { action: string; mode: string; policyVersion: string; copyVersion: string; grantedAt: number | null; revokedAt: number | null; dailyLimit: number; cadenceSeconds: number };
  // Reply callers must populate this from policy-store's persisted official-source audit lookup.
  replyEligibility?: { eventId: string; kind: 'mention' | 'quote'; targetId: string; accountId: number; observedAt: number; source: 'official_x_api'; authorXUserId: string; connectedXUserId: string; summonedXUserId: string };
  history: Array<{ accountId: number; action: string; text: string; clusterId?: string; sourceHandle?: string; targetId?: string; publishedAt: number }>;
};

export function normalizePublicationText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('und').replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

function nearCopy(a: string, b: string): boolean {
  const left = normalizePublicationText(a), right = normalizePublicationText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length,right.length) < 24) return false;
  const grams = (text: string) => new Set(Array.from({length:Math.max(0,text.length-3)},(_,i)=>text.slice(i,i+4)));
  const x=grams(left), y=grams(right);
  const intersection=[...x].filter(value=>y.has(value)).length;
  // ponytail: deterministic character overlap; replace only after measured evasion evidence.
  return intersection / Math.max(1,Math.min(x.size,y.size)) >= .85;
}

export function decideXPolicy(input: PolicyEvidence): PolicyDecision {
  const reasons: string[]=[];
  const deny=(reason:string)=>reasons.push(reason);
  const fingerprint=createHash('sha256').update(normalizePublicationText(input.text)).digest('hex');
  if (!['post','repost','reply','quote','media'].includes(input.action)) deny('unsupported_action');
  if (!['observe','assist','auto'].includes(input.mode) || typeof input.automatic !== 'boolean') deny('invalid_context');
  if (!Number.isSafeInteger(input.accountId) || input.accountId<1 || !Number.isFinite(input.now)) deny('invalid_context');
  if (!input.grantConnected) deny('grant_disconnected');
  if (input.mode==='observe') deny('observe_only');
  if (input.optedOut) deny('user_opt_out');
  if (input.kills?.global || input.kills?.account || input.kills?.category || input.kills?.actions?.includes(input.action)) deny('kill_switch');
  if (!input.capabilities.includes(input.action)) deny('capability_unverified');
  if (input.action==='quote' && input.quoteEntitled!==true) deny('quote_entitlement_unverified');
  if (!input.automatic && !input.humanApproved) deny('human_approval_required');
  if (input.sensitive) deny('sensitive_content');
  if (input.action==='media' && !input.mediaRightsCleared) deny('media_rights_uncleared');
  if (input.action!=='repost' && !input.text.trim()) deny('empty_text');
  const recent=input.history.filter(row=>row.publishedAt<=input.now && row.publishedAt>input.now-86400);
  if (input.automatic) {
    if (input.mode!=='auto') deny('automation_mode_required');
    const consent=input.consent;
    if (!consent || consent.action!==input.action || consent.mode!=='auto' || consent.policyVersion!==X_POLICY_VERSION
      || consent.copyVersion!==X_CONSENT_COPY_VERSION || consent.grantedAt===null || consent.grantedAt>input.now || consent.revokedAt!==null) deny('explicit_current_consent_required');
    if (consent) {
      const own=recent.filter(row=>row.accountId===input.accountId && row.action===input.action);
      if (!Number.isSafeInteger(consent.dailyLimit) || consent.dailyLimit<1 || own.length>=consent.dailyLimit) deny('daily_limit');
      if (!Number.isFinite(consent.cadenceSeconds) || consent.cadenceSeconds<1 || own.some(row=>input.now-row.publishedAt<consent.cadenceSeconds)) deny('cadence_limit');
    }
    if (input.trigger==='x_trending_topic') deny('trend_only_trigger');
  }
  if (input.action==='reply') {
    const eligibility=input.replyEligibility;
    // Self-serve API requires an actual author summon even for manually approved replies.
    if (!eligibility || !eligibility.eventId || eligibility.source !== 'official_x_api' || !['mention','quote'].includes(eligibility.kind)
      || eligibility.accountId!==input.accountId || eligibility.targetId!==input.targetId
      || !/^\d{1,19}$/.test(eligibility.targetId) || !/^\d{1,19}$/.test(eligibility.authorXUserId)
      || !/^\d{1,19}$/.test(eligibility.connectedXUserId) || eligibility.connectedXUserId!==eligibility.summonedXUserId
      || eligibility.authorXUserId===eligibility.connectedXUserId
      || !Number.isSafeInteger(eligibility.observedAt)
      || eligibility.observedAt>input.now || eligibility.observedAt<input.now-7*86400) deny('reply_summon_evidence_required');
  }
  if (input.action==='repost') {
    if (!input.targetId) deny('repost_target_required');
    if (input.targetAuthorAccountId && input.targetAuthorAccountId!==input.accountId) deny('cross_account_self_amplification');
    if (recent.some(row=>row.action==='repost' && (row.targetId===input.targetId
      || (row.sourceHandle===input.sourceHandle && input.sourceHandle && input.now-row.publishedAt<3600)
      || (row.clusterId===input.clusterId && input.clusterId)))) deny('repost_cooldown');
  } else {
    if (input.sourceText && nearCopy(input.text,input.sourceText)) deny('source_near_copy');
    if (recent.some(row=>nearCopy(input.text,row.text))) deny('publication_near_duplicate');
  }
  return {allowed:reasons.length===0,version:X_POLICY_VERSION,reasons:[...new Set(reasons)],fingerprint};
}
