import type { XPost, XProfile, XReader, XReaderCapabilities, XReaderHealth, XTimelineBatch, XSearchResult } from "./x-reader";

/** Explicit contributor fixtures. Receipts are simulated and never remote proof. */
export const demoPosts: readonly XPost[] = [{
  id:"1000000000000000001",url:"https://x.com/demo_source/status/1000000000000000001",
  text:"Demo: a research team publishes an open dataset. This is a synthetic contributor fixture.",createdAt:1700000000,
  author:{handle:"demo_source",name:"Demo source",bio:"Synthetic fixture",avatarUrl:"",followers:null,following:null,statuses:null,likes:null,mediaCount:null,verification:"unknown"},
  metrics:{likes:12,replies:3,reposts:4,quotes:null,views:null,pollVotes:null,capturedAt:1700000060,quality:"partial"},
  media:[],sensitive:false,discovery:{quoteAuthor:"",replyTo:"",mentions:[]},
}];
export class FixtureXReader implements XReader {
  constructor(private readonly posts:readonly XPost[]=demoPosts){}
  async fetchTimeline(input:{handle:string;maxPosts?:number}):Promise<XTimelineBatch>{return {posts:structuredClone(this.posts.filter(p=>p.author.handle===input.handle).slice(0,input.maxPosts??20)),cursor:"",receivedAt:1700000060};}
  async search(input:{query:string;count?:number}):Promise<XSearchResult>{return {query:input.query,posts:structuredClone(this.posts.filter(p=>p.text.toLowerCase().includes(input.query.toLowerCase())).slice(0,input.count??20)),cursor:"",receivedAt:1700000060};}
  async fetchConversation(input:{externalId:string}):Promise<XTimelineBatch>{return {posts:[await this.fetchPostMetrics(input)],cursor:"",receivedAt:1700000060};}
  async fetchPostMetrics(input:{externalId:string}):Promise<XPost>{const post=this.posts.find(p=>p.id===input.externalId);if(!post)throw new Error("Fixture post not found");return structuredClone(post);}
  async fetchProfile(input:{handle:string}):Promise<XProfile>{const profile=this.posts.find(p=>p.author.handle===input.handle)?.author;if(!profile)throw new Error("Fixture profile not found");return structuredClone(profile);}
  capabilities():XReaderCapabilities{return {timeline:true,search:true,conversation:true,postMetrics:true,profile:true};}
  health():XReaderHealth{return {transport:"fixture",checkedAt:1700000060,ok:true,latencyMs:0,freshnessSeconds:null,missingFields:["stable_author_id","views","quotes"],schemaDrift:false};}
}
export type SimulatedReceipt={id:string;text:string;simulated:true;transport:"fixture"};
export class FixtureXPublisher {
  readonly receipts:SimulatedReceipt[]=[];
  async publishPost(input:{text:string}):Promise<SimulatedReceipt>{
    if(!input.text.trim())throw new Error("Fixture text cannot be empty");
    const receipt:SimulatedReceipt={id:`demo-${this.receipts.length+1}`,text:input.text,simulated:true,transport:"fixture"};
    this.receipts.push(receipt);return structuredClone(receipt);
  }
}
