import { withUser } from "@/server/request-auth";
import { readJsonBody } from "@/server/api-guard";
import { getAccountCategoryConfigs, getAccounts } from "@/server/db";
import { suggestScopedAutonomy } from "@/server/autonomy/evaluation";
import { getAutonomyEvidence } from "@/server/evaluation-store";

export const runtime="nodejs";
export const POST=withUser(async(request:Request,context:{params:Promise<{id:string}>})=>{
  try {
    const accountId=(await context.params).id, account=getAccounts().find(row=>String(row.id)===accountId&&row.enabled);
    if(!account)return Response.json({error:"Hesap bulunamadı"},{status:404});
    const body=await readJsonBody(request),action=String(body.action||""),category=String(body.category||"");
    if(!["post","repost","reply"].includes(action)||!getAccountCategoryConfigs(account.id).some(row=>row.enabled&&row.categorySlug===category))return Response.json({error:"Geçersiz eylem veya hesap kategorisi"},{status:400});
    const scope={accountId:String(account.id),action,category,riskTier:"low"};
    const result=suggestScopedAutonomy({...scope,createdAt:Math.floor(Date.now()/1000)});
    if(!result.suggested)return Response.json({suggested:false,reason:result.reason});
    const evidence=getAutonomyEvidence(scope);
    return Response.json({suggested:true,proposalId:result.suggestionId,scope,modelKey:evidence.modelKey,selectorVersion:evidence.selectorVersion,evidenceHash:evidence.evidenceHash,cleanApprovals:evidence.cleanApprovals});
  } catch(error) { return Response.json({error:error instanceof Error?error.message:"Özerklik önerisi oluşturulamadı"},{status:400}); }
});
