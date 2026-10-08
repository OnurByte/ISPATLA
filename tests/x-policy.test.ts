import { expect,test } from 'bun:test';
import { decideXPolicy, X_POLICY_VERSION, X_CONSENT_COPY_VERSION, type PolicyEvidence } from '../src/server/x-policy';
const evidence:PolicyEvidence={action:'post',automatic:true,mode:'auto',accountId:1,now:100000,text:'A distinct original report with verified evidence.',grantConnected:true,capabilities:['post','repost','reply','media'],trigger:'event',history:[],consent:{action:'post',mode:'auto',policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,grantedAt:99900,revokedAt:null,dailyLimit:3,cadenceSeconds:900}};
test('golden X policy denies prohibited and unconsented actions across invocation modes',()=>{
 expect(decideXPolicy(evidence).allowed).toBe(true);
 expect(decideXPolicy({...evidence,automatic:false,humanApproved:true,mode:'garbage' as PolicyEvidence['mode']}).allowed).toBe(false);
 for(const patch of [{action:'like'},{action:'dm'},{consent:undefined},{mode:'observe'},{optedOut:true},{grantConnected:false},{kills:{global:true}},{trigger:'x_trending_topic'},{sensitive:true},{action:'quote',quoteEntitled:false},{action:'media',mediaRightsCleared:false},{action:'reply',humanApproved:true}]) expect(decideXPolicy({...evidence,...patch} as PolicyEvidence).allowed).toBe(false);
 expect(decideXPolicy({...evidence,automatic:false,mode:'assist',humanApproved:true}).allowed).toBe(true);
 expect(decideXPolicy({...evidence,consent:{...evidence.consent!,revokedAt:99999}}).allowed).toBe(false);
 expect(decideXPolicy({...evidence,history:[{accountId:2,action:'post',text:evidence.text+'!',publishedAt:99999}]}).reasons).toContain('publication_near_duplicate');
 expect(decideXPolicy({...evidence,sourceText:evidence.text}).reasons).toContain('source_near_copy');
 expect(decideXPolicy({...evidence,history:[{accountId:1,action:'post',text:'Completely unrelated old news',publishedAt:99999}]}).reasons).toContain('cadence_limit');
});
test('reply requires audited summon tied to target and repost cooldown blocks amplification',()=>{
 const reply={...evidence,action:'reply',automatic:false,humanApproved:true,targetId:'123',replyEligibility:{eventId:'summon-1',kind:'mention' as const,targetId:'123',accountId:1,observedAt:99999,source:'official_x_api' as const,authorXUserId:'456',connectedXUserId:'1234',summonedXUserId:'1234'}};
 expect(decideXPolicy(reply).allowed).toBe(true);
 expect(decideXPolicy({...reply,replyEligibility:{...reply.replyEligibility,accountId:2}}).allowed).toBe(false);
 expect(decideXPolicy({...reply,replyEligibility:{...reply.replyEligibility,source:'fxtwitter' as 'official_x_api'}}).reasons).toContain('reply_summon_evidence_required');
 expect(decideXPolicy({...reply,replyEligibility:{...reply.replyEligibility,summonedXUserId:'999'}}).reasons).toContain('reply_summon_evidence_required');
 expect(decideXPolicy({...reply,replyEligibility:{eventId:'claim',kind:'mention',targetId:'123',accountId:1,observedAt:99999} as typeof reply.replyEligibility}).reasons).toContain('reply_summon_evidence_required');
 const repost={...evidence,action:'repost',text:'',automatic:false,humanApproved:true,targetId:'123',sourceHandle:'source',clusterId:'event'};
 expect(decideXPolicy(repost).allowed).toBe(true);
 expect(decideXPolicy({...repost,targetAuthorAccountId:2}).reasons).toContain('cross_account_self_amplification');
 expect(decideXPolicy({...repost,history:[{accountId:2,action:'repost',text:'',targetId:'123',publishedAt:99999}]}).reasons).toContain('repost_cooldown');
});
