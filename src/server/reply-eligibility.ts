import type {Account} from "./db";
import {OfficialXClient} from "./official-x";
import {withOfficialAccount} from "./publisher";
import {getAuditedReplyEligibility,recordOfficialReplySummon} from "./policy-store";

function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
/** Resolve author-summon eligibility from authenticated official reads, never draft text. */
export async function verifyOfficialReplyEligibility(account:Account,targetId:string,now:number,client=new OfficialXClient()):Promise<void>{
  if(getAuditedReplyEligibility({accountId:account.id,targetId,now}))return;
  await withOfficialAccount(account,async credential=>{
    const post=await client.getPost(credential,targetId);
    if(!post||post.id!==targetId||typeof post.author_id!=="string"||post.author_id===credential.xUserId)return;
    const mentions=record(post.entities).mentions;
    const mentionedUserIds=Array.isArray(mentions)?mentions.map(item=>record(item).id).filter((id):id is string=>typeof id==="string"&&/^\d{1,19}$/.test(id)):[];
    if(mentionedUserIds.includes(credential.xUserId)){
      recordOfficialReplySummon({accountId:account.id,connectedXUserId:credential.xUserId,kind:"mention",post:{id:targetId,author_id:post.author_id,mentionedUserIds},observedAt:now});return;
    }
    const references=post.referenced_tweets??post.referenced_posts;
    const quotes=Array.isArray(references)?references.map(record).filter(ref=>ref.type==="quoted"&&typeof ref.id==="string"&&/^\d{1,19}$/.test(ref.id)):[];
    // Official X posts have one quote target; malformed or ambiguous evidence stays ineligible.
    if(quotes.length!==1)return;
    const quoted=await client.getPost(credential,String(quotes[0].id));
    if(!quoted||quoted.id!==quotes[0].id||quoted.author_id!==credential.xUserId)return;
    recordOfficialReplySummon({accountId:account.id,connectedXUserId:credential.xUserId,kind:"quote",post:{id:targetId,author_id:post.author_id,quotedAuthorXUserId:credential.xUserId},observedAt:now});
  });
}
