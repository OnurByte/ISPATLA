import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("Claude BYOK uses the owner's key, strict JSON, safe errors and fails closed under an unknown dollar cost", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-claude-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `
        import { setAiSettings, testAiConnection, requestAiText } from "./src/server/ai.ts";
        import { runAsOwner } from "./src/server/owner-context.ts";
        import { saveSecret } from "./src/server/vault.ts";
        import { setSetting } from "./src/server/db.ts";
        let calls=0, status=200, stop="end_turn";
        globalThis.fetch=async (url, init) => {
          calls++;
          if(url !== "https://api.anthropic.com/v1/messages") throw Error("wrong endpoint");
          if(new Headers(init.headers).get("x-api-key") !== "owner-test-key") throw Error("wrong owner");
          const body=JSON.parse(init.body);
          if(body.model !== "claude-sonnet-5-5" || body.output_config.format.type !== "json_schema") throw Error("wrong schema");
          if(status !== 200) return new Response("private-upstream-body", {status});
          return Response.json({stop_reason:stop, content:[{type:"text", text:JSON.stringify(body.output_config.format.schema.properties.ok ? {ok:true} : {text:"draft"})}], usage:{input_tokens:3,output_tokens:2}});
        };
        await runAsOwner("claude-owner", async () => {
          saveSecret("anthropic_api_key", "Claude", "owner-test-key");
          setAiSettings("anthropic", "claude-sonnet-5-5");
          await testAiConnection();
          if(await requestAiText({evidence:"data",instructions:"return text"}) !== "draft") throw Error("wrong text");
          setSetting("ai_daily_budget_usd", "1", Date.now()/1000);
          const before=calls;
          try { await testAiConnection(); throw Error("budget bypass"); } catch(error) { if(!String(error).includes("request cost is unknown")) throw error; }
          if(calls !== before) throw Error("budget made network call");
          setSetting("ai_daily_budget_usd", "0", Date.now()/1000);
          status=401;
          try { await testAiConnection(); throw Error("missing error"); } catch(error) { if(!String(error).includes("Claude 401") || String(error).includes("private-upstream")) throw error; }
          status=200; stop="max_tokens";
          try { await testAiConnection(); throw Error("accepted incomplete"); } catch(error) { if(!String(error).includes("incomplete")) throw error; }
        });
        await runAsOwner("another-owner", async () => {
          setAiSettings("anthropic", "claude-sonnet-5-5");
          const before=calls;
          try { await testAiConnection(); throw Error("shared key leaked"); } catch(error) { if(!String(error).includes("ANTHROPIC_API_KEY missing")) throw error; }
          if(calls !== before) throw Error("other owner made request");
        });
      `],
      env: { ...process.env, ISPATLA_DB: join(directory, "test.sqlite3"), ISPATLA_SECRET_KEY: "claude-test-vault", ANTHROPIC_API_KEY: "must-not-leak" },
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
