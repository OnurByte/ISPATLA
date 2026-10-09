import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseChatGPTStream, responseText } from "@/server/ai";

test("response text ignores metadata and missing content", () => {
  expect(responseText({ type: "message", content: [{ type: "output_text", text: "actual output" }] })).toBe("actual output");
  expect(responseText({ type: "message", output: [{ type: "output_text" }] })).toBeNull();
  expect(responseText(undefined)).toBeNull();
});

test("ChatGPT streaming parser accepts completed events and rejects missing or failed outcomes", () => {
  expect(parseChatGPTStream('event: response.completed\r\ndata: {"type":"response.completed","response":{"output":[]}}\r\n\r\n')).toEqual({ output: [] });
  expect(() => parseChatGPTStream('data: {"type":"response.incomplete"}\n\n')).toThrow("incomplete");
  expect(() => parseChatGPTStream('data: [DONE]\n\n')).toThrow("without a completed");
});

test("ChatGPT plan inference gates model access, owner credentials and a successful structured test", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-chatgpt-inference-"));
  try {
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
      import { strict as assert } from "node:assert";
      import { setAiSettings, testAiConnection, requestAiText, aiModelCapabilities } from "./src/server/ai.ts";
      import { runAsOwner } from "./src/server/owner-context.ts";
      import { saveSecret, removeSecret } from "./src/server/vault.ts";
      const scopes=["openid","profile","email","offline_access","resource.invoke","chatgpt.tokens.use.direct"];
      let calls=0;
      globalThis.fetch=async(url,init)=>{
        calls++;
        assert.equal(new Headers(init.headers).get("authorization"), "Bearer owner-access");
        if(String(url).endsWith("/models")) return Response.json({data:[{id:"eligible-model"}]});
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        const body=JSON.parse(init.body);
        assert.equal(body.store,false); assert.equal(body.stream,true);
        assert.equal(body.text.format.strict,true);
        const value=body.text.format.schema.properties.ok ? {ok:true} : {text:"owned draft"};
        return new Response('data: '+JSON.stringify({type:"response.completed",response:{status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}],usage:{input_tokens:2,output_tokens:3}}})+'\\n\\n',{headers:{"content-type":"text/event-stream"}});
      };
      await runAsOwner("plan-owner",async()=>{
        saveSecret("chatgpt_plan_usage","ChatGPT",JSON.stringify({clientId:"issued-client-123",subject:"owner",email:null,idToken:"retained-identity",accessToken:"owner-access",refreshToken:"refresh",expiresAt:Date.now()+3600000,scopes}));
        setAiSettings("chatgpt","eligible-model");
        await assert.rejects(()=>requestAiText({evidence:"data",instructions:"text"}), /connection test/);
        assert.equal(calls,0);
        await testAiConnection();
        assert.ok(aiModelCapabilities("chatgpt","eligible-model"));
        assert.equal(await requestAiText({evidence:"data",instructions:"text"}), "owned draft");
        setAiSettings("chatgpt","missing-model");
        await assert.rejects(()=>testAiConnection(),/not available/);
        removeSecret("chatgpt_plan_usage");
        assert.equal(aiModelCapabilities("chatgpt","eligible-model"),null);
      });
      await runAsOwner("other-owner",async()=>{
        setAiSettings("chatgpt","eligible-model");
        const before=calls;
        await assert.rejects(()=>testAiConnection(),/not connected/);
        assert.equal(calls,before);
      });
    `], env: { ...process.env, NODE_ENV: "test", ISPATLA_DB: join(directory, "test.sqlite3"), ISPATLA_SECRET_KEY: "chatgpt-inference-test-vault" }, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
