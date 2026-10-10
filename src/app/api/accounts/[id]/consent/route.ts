import { withUser } from '@/server/request-auth';
import { currentOwnerId } from '@/server/owner-context';
import { getPostgresXAccounts } from '@/server/postgres-x-oauth';
import { readJsonBody } from '@/server/api-guard';
import { setAutomationConsent } from '@/server/x-oauth';
import { X_POLICY_VERSION, X_CONSENT_COPY_VERSION } from '@/server/x-policy';
export const runtime='nodejs';
export const POST=withUser(async(request:Request,context:{params:Promise<{id:string}>})=>{
  const id=Number((await context.params).id);
  const owner=currentOwnerId()!;
  if(!(await getPostgresXAccounts(owner)).some(account=>account.id===id))return Response.json({error:'Hesap bulunamadı'},{status:404});
  try{
    const body=await readJsonBody(request);
    const action=body.action,mode=body.mode;
    if(!['post','repost','reply','future_quote'].includes(String(action)) || !['observe','assist','auto','off'].includes(String(mode)))return Response.json({error:'Geçersiz eylem veya mod'},{status:400});
    // Category-scoped autonomy is still stored by the synchronous legacy DB layer; fail closed until it is ported.
    if(mode==='auto')return Response.json({error:'Önce bu eylem için en az bir kategori kapsamında özerkliği onaylayın'},{status:409});
    if(body.policyVersion!==X_POLICY_VERSION || body.copyVersion!==X_CONSENT_COPY_VERSION)return Response.json({error:'Güncel izin metnini yeniden okuyun'},{status:409});
    const expectedVersion=Number(body.expectedVersion), dailyLimit=Number(body.dailyLimit),cadenceSeconds=Number(body.cadenceSeconds);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!Number.isSafeInteger(dailyLimit)||dailyLimit<0||dailyLimit>100||!Number.isSafeInteger(cadenceSeconds)||cadenceSeconds<0||cadenceSeconds>86400)return Response.json({error:'İzin sürümü veya limit geçersiz'},{status:400});
    const consent=await setAutomationConsent({accountId:id,ownerUserId:owner,action:action as 'post'|'repost'|'reply'|'future_quote',mode:mode as 'observe'|'assist'|'auto'|'off',policyVersion:X_POLICY_VERSION,copyVersion:X_CONSENT_COPY_VERSION,expectedVersion,dailyLimit,cadenceSeconds});
    return Response.json(consent);
  }catch{return Response.json({error:'İzin güncellenemedi; bağlantıyı ve izin sürümünü kontrol edin'},{status:409});}
});
