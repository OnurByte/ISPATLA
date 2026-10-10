import {expect,test} from 'bun:test';
import {OfficialXPublisher,publish} from '@/server/publisher';
import {OfficialXClient} from '@/server/official-x';
const account={id:1,accountKey:'main',handle:'main',displayName:'Main',enabled:true,defaultAccount:true,automationMode:'manual' as const,dailyLimit:24,capabilities:[],styleProfile:{},subscriptionHistory:[],subscriptionState:{tier:'unknown' as const,observedAt:0,historyComplete:false},updatedAt:1};
test('official publisher requires explicit credentials and capability evidence',async()=>{
 const calls:Array<{url:string;authorization:string|null;body:unknown}>=[];
 const client=new OfficialXClient(async(input,init)=>{
   calls.push({url:String(input),authorization:new Headers(init?.headers).get('authorization'),body:JSON.parse(String(init?.body))});
   return Response.json({data:{id:'123',text:'hello'}});
 });
 const publisher=new OfficialXPublisher(client);
 expect((await publisher.health({ ...account, ownerUserId: null })).ok).toBe(false);
 expect(publisher.capabilities()).toEqual({post:false,repost:false,reply:false,media:false,quote:'unknown'});
 expect(publisher.capabilities(['tweet.write','tweet.read','media.write'])).toEqual({post:true,repost:true,reply:true,media:true,quote:'unknown'});
 await expect(publish({account,credentials:{accessToken:'fixture-only',xUserId:'42'},text:'hello'},publisher)).resolves.toEqual({id:'123',text:'hello',ok:true,transport:'official_x'});
 expect(calls).toEqual([{url:'https://api.x.com/2/tweets',authorization:'Bearer fixture-only',body:{text:'hello'}}]);
});
