import {
 claimAccountDispatchLease,renewAccountDispatchLease,releaseAccountDispatchLease,isAccountDispatchLeaseCurrent,readPublicationPolicyHistory,
 createJob,claimAutomationJobLease,renewAutomationJobLease,markAutomationJobRequestSent,finishAutomationJobLease,getApprovalSnapshotSource,
 getAccountCategoryConfigs,getAccounts,getDraft,getJob,getJobs,getPost,getSourceRights,updateDraft,updateJob,
 confirmAutomationJobRemote,markAutomationJobReconciliationRequired,
 recoverExpiredAutomationJobs,getStaleRunningJobs,recoverStaleAutomationJob,type AutomationJob,type PublicationIntent,
} from './db';
import {OfficialXClient,OfficialXError} from './official-x';
import {withOfficialAccount} from './publisher';
import {getXAccountAuthState} from './x-oauth';
import {markXAccountReauthorizationRequired} from './x-oauth-store';
import {currentOwnerId,runAsOwner} from './owner-context';
import {verifyOfficialReplyEligibility} from './reply-eligibility';
import {getEffectivePolicyKills,getAuditedReplyEligibility} from './policy-store';
import {decideXPolicy} from './x-policy';
import {publishingEnabled,qualityGate} from './pipeline';
import {createIntentForDraft} from './publication-service';
import {authorizeAutomaticSend,demoteAutomaticExecution} from './autonomy/execution';
import {confirmedAutonomyAuthorization} from './evaluation-store';

export function queueDraftIds(draftIds:number[],now=Math.floor(Date.now()/1000)):{intents:PublicationIntent[];jobs:AutomationJob[]}{
 const ids=[...new Set(draftIds)].filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,100);
 if(!ids.length)throw new Error('En az bir draft seçilmeli');
 const rows=ids.map(id=>{
  const draft=getDraft(id),account=getAccounts().find(item=>item.id===draft?.accountId&&item.enabled);
  if(!draft||!account)throw new Error(`draft #${id}: aktif hesap gerekli`);
  if(!['post','repost','reply'].includes(draft.format))throw new Error(`draft #${id}: eylem desteklenmiyor`);
  if(draft.status==='blocked')throw new Error(`draft #${id}: quality gate blokladı`);
  return {draft,account};
 });
 const intents=rows.filter(row=>row.draft.format==='post').map(row=>createIntentForDraft(row.draft.id,row.account.id,now));
 const jobs=rows.filter(row=>row.draft.format!=='post').map(row=>{
  if(row.draft.status!=='ready')throw new Error('Eylem için önce insan onayı gerekli');
  const job=createJob({draftId:row.draft.id,accountId:row.account.id,action:row.draft.format,scheduledAt:now,now});
  updateDraft({id:row.draft.id,status:'queued',now});return job;
 });
 return {intents,jobs};
}

export async function runDueAutomationJobs(now=Math.floor(Date.now()/1000),limit=10):Promise<Array<{id:number;ok:boolean;reason?:string}>>{
 await recoverStaleAutomationJobs(now);
 if(!publishingEnabled())return [];
 const due=getJobs(200).filter(job=>job.status==='queued'&&job.scheduledAt<=now&&job.nextAttemptAt<=now&&getAccounts().some(account=>account.id===job.accountId&&account.automationMode==='auto')).slice(0,Math.max(1,Math.min(50,limit)));
 const results=[];
 for(const job of due){try{const result=await runAutomationJob(job.id,now);results.push({id:job.id,ok:result.ok,reason:result.reason});}catch{results.push({id:job.id,ok:false,reason:'İş yürütülemedi'});}}
 return results;
}

export async function runAutomationJob(id:number,now=Math.floor(Date.now()/1000),client=new OfficialXClient()):Promise<{ok:boolean;job:AutomationJob|null;reason?:string}>{
 if(!publishingEnabled())return {ok:false,job:getJob(id),reason:'publishing is paused'};
 const job=getJob(id);if(!job)throw new Error('job bulunamadı');
 if(!['queued','failed'].includes(job.status))throw new Error('job çalıştırılamaz');
 if(job.scheduledAt>now||job.nextAttemptAt>now)return {ok:false,job,reason:'job is not due'};
 const draft=getDraft(job.draftId);if(!draft)throw new Error('draft bulunamadı');
 const post=draft.externalId?getPost(draft.externalId):null;
 if(post&&job.action==='post'){
  const reason=qualityGate(post,draft.text);if(reason){const candidate=getAccounts().find(row=>row.id===job.accountId);if(candidate?.ownerUserId)runAsOwner(candidate.ownerUserId,()=>{const consent=getXAccountAuthState(candidate.id,candidate.ownerUserId!)?.consents.find(row=>row.action==='post');if(consent?.mode==='auto')try{demoteAutomaticExecution({draftId:draft.id,accountId:candidate.id,action:'post',reason:'unacceptable_outcome',now});}catch{}});const blocked=updateJob({id,status:'blocked',reason,now});updateDraft({id:draft.id,status:'blocked',gateReason:reason,now});return {ok:false,job:blocked,reason};}
 }
 const account=getAccounts().find(row=>row.id===job.accountId&&row.enabled);
 if(!account?.ownerUserId||currentOwnerId()&&currentOwnerId()!==account.ownerUserId)throw new Error('Hesabın resmi X bağlantısı gerekli');
 return runAsOwner(account.ownerUserId,async()=>{
  const state=getXAccountAuthState(account.id,account.ownerUserId!);
  const consent=state?.consents.find(row=>row.action===job.action);
  const mode=consent?.mode==='auto'?'auto':consent?.mode==='assist'?'assist':'observe';
  const targetId=draft.sourceUrl.match(/\/status\/(\d+)/)?.[1];
  const category=getAccountCategoryConfigs().filter(row=>row.accountId===account.id&&row.enabled).sort((a,b)=>Number(b.primary)-Number(a.primary)||b.priority-a.priority)[0]?.categorySlug;
  const policyControls=()=>({kills:getEffectivePolicyKills({accountId:account.id,category,action:job.action as 'post'|'repost'|'reply'}),replyEligibility:job.action==='reply'&&targetId?getAuditedReplyEligibility({accountId:account.id,targetId,now:clock()}):undefined});
  const clock=()=>Math.floor(Date.now()/1000);
  if(job.action==='reply'&&targetId&&state?.connected&&mode!=='observe') {
    try{await verifyOfficialReplyEligibility(account,targetId,clock(),client);}catch{if(mode==='auto')demoteForAutomaticFailure({draftId:draft.id,accountId:account.id,action:job.action as 'post'|'repost'|'reply'},'auth uncertainty',clock());return {ok:false,job:getJob(id),reason:'Official reply evidence could not be read; no publication attempted'};}
  }
  const evidence={...policyControls(),action:job.action,automatic:mode==='auto',mode,accountId:account.id,now,text:draft.text,
   grantConnected:Boolean(state?.connected),capabilities:state?.scopes.includes('tweet.write')?['post','repost','reply']:[],
   humanApproved:getApprovalSnapshotSource('automation_job',job.id)==='human',consent:consent||undefined,targetId,
   sourceText:post?.text,clusterId:post?.clusterKey,sourceHandle:post?.sourceHandle,sensitive:post?.sensitive,
   mediaRightsCleared:post?getSourceRights(post.sourceHandle)==='cleared':false,trigger:'manual' as const,
   history:queuePolicyHistory(id,now)};
  const policy=decideXPolicy({...evidence,mode});
  if(!policy.allowed){const reason=policy.reasons.join(', ');if(mode==='auto')demoteForAutomaticFailure({draftId:draft.id,accountId:account.id,action:job.action as 'post'|'repost'|'reply'},reason,now);return {ok:false,job:updateJob({id,status:'blocked',reason,now}),reason};}
  const accountLease=claimAccountDispatchLease({accountId:account.id,now});
  if(!accountLease)return {ok:false,job:getJob(id),reason:'account dispatch already reserved'};
  const lease=claimAutomationJobLease({id,now});if(!lease){releaseAccountDispatchLease({...accountLease,now});return {ok:false,job:getJob(id),reason:'job already claimed'};}
  let healthy=true;
  const heartbeat=setInterval(()=>{try{healthy=healthy&&renewAccountDispatchLease({...accountLease,now:clock()})&&renewAutomationJobLease({id,leaseToken:lease.leaseToken,now:clock()});}catch{healthy=false;}},15000);
  try{
   const receipt=await withOfficialAccount(account,async credential=>{
    if(!healthy||!publishingEnabled()||!isAccountDispatchLeaseCurrent({...accountLease,now:clock()})||!getAccounts().some(row=>row.id===account.id&&row.enabled))throw new Error('Dispatch paused before send');
    const latest=getXAccountAuthState(account.id,account.ownerUserId!);
    const fresh=latest?.consents.find(row=>row.action===job.action);
    if(!latest?.connected||fresh?.mode!==mode){if(mode==='auto')demoteForAutomaticFailure({draftId:draft.id,accountId:account.id,action:job.action as 'post'|'repost'|'reply'},'auth uncertainty',clock());throw new Error('Policy changed before send');}
    if(!decideXPolicy({...evidence,...policyControls(),mode,now:clock(),grantConnected:true,consent:fresh,history:queuePolicyHistory(id,clock())}).allowed){if(mode==='auto')demoteForAutomaticFailure({draftId:draft.id,accountId:account.id,action:job.action as 'post'|'repost'|'reply'},'final policy changed before send',clock());throw new Error('Policy changed before send');}
    let autonomyCategory:string|undefined,autonomyEvidenceHash:string|undefined,autonomyModelKey:string|undefined,autonomySelectorVersion:string|undefined;
    if(mode==='auto'){
      authorizeAutomaticSend({draftId:draft.id,accountId:account.id,action:job.action as 'post'|'repost'|'reply'});
      autonomyCategory=draft.evaluation?.categorySlug;
      const authorization=autonomyCategory?confirmedAutonomyAuthorization({accountId:String(account.id),action:job.action,category:autonomyCategory,riskTier:'low'}):null;
      autonomyEvidenceHash=authorization?.evidenceHash;autonomyModelKey=authorization?.modelKey;autonomySelectorVersion=authorization?.selectorVersion;
      if(!autonomyEvidenceHash||!autonomyModelKey||!autonomySelectorVersion)throw new Error('confirmed autonomy scope is unavailable');
    }
   if(!markAutomationJobRequestSent({id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,now:clock(),authorization:{ownerUserId:account.ownerUserId!,mode:mode as 'assist'|'auto',consentVersion:fresh.version,policyVersion:fresh.policyVersion,copyVersion:fresh.copyVersion,xUserId:credential.xUserId,credentialVersion:credential.version,...(mode==='auto'?{category:autonomyCategory!,autonomyEvidenceHash:autonomyEvidenceHash!,autonomyModelKey:autonomyModelKey!,autonomySelectorVersion:autonomySelectorVersion!}:{})}}))throw new Error('Dispatch lease lost');
    if(job.action==='post')return client.createPost(credential,{text:draft.text});
    if(job.action==='repost'&&targetId)return client.repost(credential,targetId);
    const eligibility=job.action==='reply'&&targetId?getAuditedReplyEligibility({accountId:account.id,targetId,now:clock()}):undefined;
    if(job.action==='reply'&&targetId&&eligibility)return client.reply(credential,{text:draft.text,postId:targetId,summonedBy:eligibility.kind==='mention'?'author_mention':'author_quoted'});
    throw new Error('Unsupported or ineligible action');
   });
   const finished=finishAutomationJobLease({id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,outcome:'accepted',receipt:JSON.stringify(receipt),reason:'X accepted; remote verification required',now:clock()});
   if(!finished)return {ok:false,job:getJob(id),reason:'Receipt arrived after lease expiry; reconcile'};
   return {ok:true,job:finished};
  }catch(error){
   const provider=error instanceof OfficialXError?error:null;
   if(provider?.code==='reauth')try{markXAccountReauthorizationRequired(account.id,account.ownerUserId!);}catch{}
   const ambiguous=provider?.code==='unknown_remote_state'||getJob(id)?.remoteWriteStartedAt!=null&&!provider?.remoteStateKnown;
   const retry=provider?.code==='rate_limited'||provider?.safeToRetry;
   const finished=finishAutomationJobLease({id,leaseToken:lease.leaseToken,accountLeaseToken:accountLease.leaseToken,outcome:ambiguous?'unknown_remote_state':retry?'retryable_failure':'permanent_failure',now:clock(),errorClass:provider?.code||'dispatch_precondition',reason:provider?.message||'Dispatch precondition changed',retryAfterSeconds:provider?.rateLimitReset?Math.max(1,provider.rateLimitReset-clock()):undefined});
   return {ok:false,job:finished||getJob(id),reason:provider?.message||'İş yürütülemedi'};
  }finally{clearInterval(heartbeat);releaseAccountDispatchLease({...accountLease,now:clock()});}
 });
}

function demoteForAutomaticFailure(input:{draftId:number;accountId:number;action:'post'|'repost'|'reply'},reason:string,now:number):void{
 const lowered=reason.toLowerCase();const classification=lowered.includes('duplicate')?'duplicate_risk':lowered.includes('unacceptable')?'unacceptable_outcome':lowered.includes('auth')||lowered.includes('connection')?'auth_uncertainty':'policy_failure';
 try{demoteAutomaticExecution({...input,reason:classification,now});}catch{}
}

export async function recoverStaleAutomationJobs(now=Math.floor(Date.now()/1000)):Promise<number>{
 let recovered=recoverExpiredAutomationJobs({now});
 for(const job of getStaleRunningJobs(now-300,100))if(recoverStaleAutomationJob({id:job.id,cutoff:now-300,status:'reconciliation_required',reason:'Legacy dispatch ambiguous; no retry',now}))recovered++;
 return recovered;
}

function receiptPostId(receipt:string):string{
 try{const value=JSON.parse(receipt) as Record<string,unknown>;const id=String(value.id||value.post_id||value.postId||'');return /^\d{1,19}$/.test(id)?id:'';}catch{return '';}
}

function jobTargetId(sourceUrl:string):string{return sourceUrl.match(/\/status\/(\d{1,19})/)?.[1]||'';}

function hasReplyTarget(post:Record<string,unknown>,targetId:string):boolean{
 const refs=Array.isArray(post.referenced_tweets)?post.referenced_tweets:[];
 return refs.some(ref=>Boolean(ref)&&typeof ref==='object'&&(ref as Record<string,unknown>).type==='replied_to'&&(ref as Record<string,unknown>).id===targetId);
}

function postMatchesJob(post:Record<string,unknown>,job:AutomationJob,text:string,xUserId:string,targetId:string):boolean{
 if(typeof post.id!=='string'||!/^\d{1,19}$/.test(post.id)||post.author_id!==xUserId||post.text!==text||typeof post.created_at!=='string')return false;
 const created=Date.parse(post.created_at);if(!Number.isFinite(created))return false;
 const sent=(job.remoteWriteStartedAt??job.updatedAt)*1000;
 if(created<sent-120_000||created>sent+15*60_000)return false;
 return job.action!=='reply'||Boolean(targetId)&&hasReplyTarget(post,targetId);
}

function markJobManualReview(job:AutomationJob,owner:string,now:number,reason:string,accountLeaseToken:string):void{
 runAsOwner(owner,()=>{
  if(!isAccountDispatchLeaseCurrent({accountId:job.accountId||0,leaseToken:accountLeaseToken,now}))return;
  markAutomationJobReconciliationRequired({id:job.id,now,reason});
 });
}

/** Reconcile only through the authenticated owner's read APIs; this never resends a write. */
export async function reconcileAutomationJobs(limit=20,options:{client?:OfficialXClient;now?:()=>number}={}):Promise<number>{
 const now=options.now||(()=>Math.floor(Date.now()/1000));
 const caller=currentOwnerId();
 const candidates=getJobs(500).filter(job=>['pending_reconciliation','reconciliation_required'].includes(job.status)).slice(0,Math.max(1,Math.min(100,Math.floor(limit))));
 const client=options.client||new OfficialXClient();let confirmed=0;
 for(const candidate of candidates){
  const account=getAccounts().find(row=>row.id===candidate.accountId);
  const owner=account?.ownerUserId;
  if(!account||!owner||caller&&caller!==owner)continue;
  const leaseNow=now();
  const accountLease=claimAccountDispatchLease({accountId:account.id,now:leaseNow,leaseSeconds:120});
  if(!accountLease)continue;
  let leaseHealthy=true;
  const heartbeat=setInterval(()=>{try{leaseHealthy=renewAccountDispatchLease({...accountLease,now:now(),leaseSeconds:120})&&leaseHealthy;}catch{leaseHealthy=false;}},15_000);
  try{
   const result=await runAsOwner(owner,async()=>{
    if(!leaseHealthy||!isAccountDispatchLeaseCurrent({...accountLease,now:now()}))return false;
    const job=getJob(candidate.id);if(!job||!['pending_reconciliation','reconciliation_required'].includes(job.status)||job.remoteWriteStartedAt===null)return false;
    const draft=getDraft(job.draftId);if(!draft)return false;
    return withOfficialAccount(account,async credential=>{
     if(!credential.scopes.includes('tweet.read'))return false;
     if(job.action==='repost'){
     const targetId=jobTargetId(draft.sourceUrl);
      if(!targetId){markJobManualReview(job,owner,now(),'repost target missing; manual reconciliation required',accountLease.leaseToken);return false;}
      const lookup=await client.getRepostedBy(credential,targetId,3);
      if(lookup.userIds.includes(credential.xUserId)){
       const url=`https://x.com/${account.handle}/status/${targetId}`;
       const updated=confirmAutomationJobRemote({id:job.id,now:now(),receipt:job.receipt||JSON.stringify({targetId,reposted:true}),remoteUrl:url});
       if(updated){updateDraft({id:draft.id,status:'confirmed',now:now()});return true;}
      }else if(lookup.complete)markJobManualReview(job,owner,now(),'official repost lookup did not confirm this account; manual reconciliation required',accountLease.leaseToken);
      return false;
     }
     if(job.action!=='post'&&job.action!=='reply'){
      markJobManualReview(job,owner,now(),'unsupported action requires manual reconciliation',accountLease.leaseToken);return false;
     }
     const targetId=job.action==='reply'?jobTargetId(draft.sourceUrl):'';
     if(job.action==='reply'&&!targetId){markJobManualReview(job,owner,now(),'reply target missing; manual reconciliation required',accountLease.leaseToken);return false;}
     const id=receiptPostId(job.receipt);
     let match:Record<string,unknown>|null=null;
     if(id){
      const post=await client.getPost(credential,id);
      if(postMatchesJob(post||{},job,draft.text,credential.xUserId,targetId))match=post;
     }
     if(!match){
      const timeline=await client.getOwnTimeline(credential,100);
      const matches=timeline.filter(post=>postMatchesJob(post,job,draft.text,credential.xUserId,targetId));
      if(matches.length===1)match=matches[0]!;
      else if(matches.length!==0){markJobManualReview(job,owner,now(),'multiple exact timeline candidates; manual reconciliation required',accountLease.leaseToken);return false;}
     }
     if(!match){markJobManualReview(job,owner,now(),'no unique authenticated post evidence; manual reconciliation required',accountLease.leaseToken);return false;}
     const postId=String(match.id);const url=`https://x.com/${account.handle}/status/${postId}`;
     const updated=confirmAutomationJobRemote({id:job.id,now:now(),receipt:job.receipt||JSON.stringify({id:postId,text:draft.text}),remoteUrl:url});
     if(updated){updateDraft({id:draft.id,status:'confirmed',now:now()});return true;}
     return false;
    });
   });
   if(result)confirmed++;
  }catch(error){
   // Read failures (including 429/5xx and expired grants) keep evidence pending for a later pass.
   if(error instanceof OfficialXError&&error.code==='reauth')try{markXAccountReauthorizationRequired(account.id,owner);}catch{}
  }finally{clearInterval(heartbeat);releaseAccountDispatchLease({...accountLease,now:now()});}
 }
 return confirmed;
}

function queuePolicyHistory(id:number,now:number){
 return readPublicationPolicyHistory({excludeJobId:id,since:now-86400}).map(row=>({accountId:row.accountId,action:row.action,text:row.text,clusterId:row.clusterId===null?undefined:String(row.clusterId),sourceHandle:row.sourceHandle,targetId:row.targetId,publishedAt:row.publishedAt??(row.potentialBudgetUsed?row.sendStartedAt??row.updatedAt:0)}));
}
