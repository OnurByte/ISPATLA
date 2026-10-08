import { withUser } from "@/server/request-auth";
import { readJsonBody } from "@/server/api-guard";
import { confirmScopedAutonomy } from "@/server/autonomy/evaluation";

export const runtime="nodejs";
export const POST=withUser(async(request:Request,context:{params:Promise<{id:string;proposalId:string}>})=>{
  try {
    const {id,proposalId}=await context.params,body=await readJsonBody(request);
    if(!/^\d+$/.test(id)||!proposalId||typeof body.evidenceHash!=="string"||!/^([a-f0-9]{64})$/.test(body.evidenceHash))return Response.json({error:"Öneri kimliği veya kanıt özeti geçersiz"},{status:400});
    const scope=confirmScopedAutonomy(proposalId,Math.floor(Date.now()/1000),body.evidenceHash,id);
    return Response.json({confirmed:true,scope});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Özerklik onaylanamadı"},{status:409});}
});
