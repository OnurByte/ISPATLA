import {expect,test} from 'bun:test';
import {OfficialXPublisher,publish} from '@/server/publisher';
import {OfficialXClient} from '@/server/official-x';
const account={id:1,accountKey:'main',handle:'main',displayName:'Main',enabled:true,defaultAccount:true,automationMode:'manual' as const,dailyLimit:24,capabilities:[],styleProfile:{},subscriptionHistory:[],subscriptionState:{tier:'unknown' as const,observedAt:0,historyComplete:false},updatedAt:1};
test('official publisher stays unavailable before Prime despite credentials and granted scopes',async()=>{
 const calls:Array<{url:string;authorization:string|null;body:unknown}>=[];
 const client=new OfficialXClient(async(input,init)=>{
   calls.push({url:String(input),authorization:new Headers(init?.headers).get('authorization'),body:JSON.parse(String(init?.body))});
   return Response.json({data:{id:'123',text:'hello'}});
 });
 const publisher=new OfficialXPublisher(client);
 const unboundHealth = await publisher.health({ ...account, ownerUserId: null });
 expect(unboundHealth.ok).toBe(false);
 expect(unboundHealth.reason).toContain('unavailable until Prime');
 expect((await publisher.health({ ...account, ownerUserId: 'owner' })).ok).toBe(false);
 expect(publisher.capabilities()).toEqual({post:false,repost:false,reply:false,media:false,quote:'unknown'});
 expect(publisher.capabilities(['tweet.write','tweet.read','media.write'])).toEqual({post:false,repost:false,reply:false,media:false,quote:'unknown'});
 await expect(publish({account,credentials:{accessToken:'fixture-only',xUserId:'42'},text:'hello'},publisher)).rejects.toMatchObject({code:'policy_blocked'});
 expect(calls).toEqual([]);
});
