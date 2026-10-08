import { withUser } from "@/server/request-auth";
import { readJsonBody } from "@/server/api-guard";
import { getAccountCategoryConfigs, getAccounts } from "@/server/db";
import { demoteAutonomyAfterIncident } from "@/server/autonomy/evaluation";

export const runtime="nodejs";
export const POST=withUser(async(request:Request,context:{params:Promise<{id:string}>})=>{
  try {
    const id=(await context.params).id,account=getAccounts().find(row=>String(row.id)===id&&row.enabled);
    if(!account)return Response.json({error:"Hesap bulunamadı"},{status:404});
    const body=await readJsonBody(request),action=String(body.action||""),category=String(body.category||"");
    if(!["post","repost","reply"].includes(action)||!getAccountCategoryConfigs(account.id).some(row=>row.enabled&&row.categorySlug===category))return Response.json({error:"Geçersiz eylem veya hesap kategorisi"},{status:400});
    const demoted=demoteAutonomyAfterIncident({accountId:id,action,category,riskTier:"low",reason:"user_requested",now:Math.floor(Date.now()/1000)});
    return Response.json({demoted});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Özerklik kapatılamadı"},{status:400});}
});
