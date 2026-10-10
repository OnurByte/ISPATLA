import {expect,test} from "bun:test";
import {FixtureXReader,FixtureXPublisher} from "../src/server/fixture-x";

test("contributor fixtures preserve missing data, simulate receipts and never fetch",async()=>{
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=(()=>{requests++;throw new Error("No network in fixture adapters");}) as unknown as typeof fetch;
  try{
    const reader=new FixtureXReader();const publisher=new FixtureXPublisher();
    const batch=await reader.fetchTimeline({handle:"demo_source"});
    expect(batch.posts).toHaveLength(1);expect(batch.posts[0].metrics.views).toBeNull();
    batch.posts[0].text="mutated";
    expect((await reader.fetchPostMetrics({externalId:batch.posts[0].id})).text).toContain("synthetic");
    const receipt=await publisher.publishPost({text:"Simulated draft"});
    expect(receipt).toMatchObject({simulated:true,transport:"fixture",id:"demo-1"});
    expect(requests).toBe(0);
  }finally{globalThis.fetch=original;}
});
test("demo mode blocks the official client even if a credential is supplied",()=>{
  const result=Bun.spawnSync({cmd:[process.execPath,"-e",`
    import assert from "node:assert/strict";
    import {OfficialXClient} from "./src/server/official-x.ts";
    let requests=0;const client=new OfficialXClient(async()=>{requests++;throw Error("network");});
    await assert.rejects(()=>client.createPost({accessToken:"fixture",xUserId:"1"},{text:"demo"}),/disabled in demo/);
    assert.equal(requests,0);
  `],env:{...process.env,ISPATLA_DEMO:"1"},stdout:"pipe",stderr:"pipe"});
  expect(result.exitCode,new TextDecoder().decode(result.stderr)).toBe(0);
});
