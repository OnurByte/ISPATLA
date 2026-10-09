import { describe, expect, test } from "bun:test";
import {
  aiModelCapabilities,
  requestAiText,
  setAiEnabled,
  setAiSettings,
  setCompatibleSettings,
  testAiConnection,
} from "@/server/ai";
import { runAsOwner } from "@/server/owner-context";
import { removeSecret, saveSecret } from "@/server/vault";

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("AI provider capabilities and connection test", () => {
  test("advertises task-specific structured-output and reasoning support", () => {
    expect(aiModelCapabilities("api", "gpt-4.1-mini")).toMatchObject({
      structuredOutput: true,
      reasoning: false,
      tasks: ["score", "text", "draft_semantics", "connection_test"],
    });
    expect(aiModelCapabilities("api", "unknown-model")).toBeNull();
    expect(aiModelCapabilities("compatible", "vendor/model")).toBeNull();
  });

  test("rejects an unregistered provider model before making a request", async () => {
    const previousFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({}); }) as unknown as typeof fetch;
    try {
      await withEnv({ ISPATLA_SECRET_KEY: "capability-test-vault-key" }, async () => {
        await runAsOwner("capability-unknown-model", async () => {
          saveSecret("openai_api_key", "OpenAI", "unused-test-key");
          setAiEnabled(true);
          setAiSettings("api", "unknown-model");
          await expect(requestAiText({ evidence: "test", instructions: "test" })).rejects.toThrow("does not support");
          expect(calls).toBe(0);
          removeSecret("openai_api_key");
        });
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("connection test uses the owner key and strict structured-output route, then gates compatible calls by owner and key", async () => {
    const previousFetch = globalThis.fetch;
    const previousVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "connection-test-vault-key";
    let calls = 0;
    const requests: Array<{ authorization: string | null; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        body,
      });
      const schemaName = (body.response_format as { json_schema?: { name?: string } })?.json_schema?.name;
      const content = schemaName === "ispatla_connection_test" ? { ok: true } : { text: "generation succeeded" };
      return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    }) as unknown as typeof fetch;
    try {
      await runAsOwner("connection-owner", async () => {
        saveSecret("compatible_api_key", "OpenAI-compatible", "first-test-key");
        setCompatibleSettings("https://gateway.example/v1", "Test gateway");
        setAiSettings("compatible", "vendor/model-v1");

        const result = await testAiConnection();
        expect(result).toEqual({ ok: true, provider: "compatible", model: "vendor/model-v1" });
        expect(requests[0].authorization).toBe("Bearer first-test-key");
        expect(requests[0].body).toMatchObject({
          model: "vendor/model-v1",
          response_format: { type: "json_schema", json_schema: { strict: true } },
        });
        expect(JSON.stringify(result)).not.toContain("first-test-key");

        await expect(requestAiText({ evidence: "test", instructions: "test" })).resolves.toBe("generation succeeded");
        expect(calls).toBe(2);

        saveSecret("compatible_api_key", "OpenAI-compatible", "rotated-test-key");
        await expect(requestAiText({ evidence: "test", instructions: "test" })).rejects.toThrow("connection test");
        expect(calls).toBe(2);
        await testAiConnection();
        expect(requests[2].authorization).toBe("Bearer rotated-test-key");
        removeSecret("compatible_api_key");
        const beforeDeletionCheck = calls;
        await withEnv({ AI_COMPATIBLE_API_KEY: "shared-key-must-not-be-used" }, async () => {
          await expect(requestAiText({ evidence: "test", instructions: "test" })).rejects.toThrow();
          await expect(testAiConnection()).rejects.toThrow();
        });
        expect(calls).toBe(beforeDeletionCheck);
      });

      await runAsOwner("another-connection-owner", async () => {
        setAiEnabled(true);
        setAiSettings("compatible", "vendor/model-v1");
        const before = calls;
        await expect(requestAiText({ evidence: "test", instructions: "test" })).rejects.toThrow("connection test");
        expect(calls).toBe(before);
      });
    } finally {
      globalThis.fetch = previousFetch;
      if (previousVault === undefined) delete process.env.ISPATLA_SECRET_KEY;
      else process.env.ISPATLA_SECRET_KEY = previousVault;
    }
  });

  test("uses the model capability record to omit unsupported reasoning instead of downgrading silently", async () => {
    const previousFetch = globalThis.fetch;
    const previousVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "api-capability-vault-key";
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ output_text: JSON.stringify({ ok: true }) });
    }) as unknown as typeof fetch;
    try {
      await runAsOwner("api-capability-owner", async () => {
        saveSecret("openai_api_key", "OpenAI", "api-capability-test-key");
        setAiSettings("api", "gpt-4.1-mini");
        await testAiConnection();
        expect(requestBody.text).toMatchObject({ format: { type: "json_schema", strict: true } });
        expect(requestBody.reasoning).toBeUndefined();
        removeSecret("openai_api_key");
      });
    } finally {
      globalThis.fetch = previousFetch;
      if (previousVault === undefined) delete process.env.ISPATLA_SECRET_KEY;
      else process.env.ISPATLA_SECRET_KEY = previousVault;
    }
  });

  test("returns a safe connection diagnostic without reflecting an upstream response body", async () => {
    const previousFetch = globalThis.fetch;
    const previousVault = process.env.ISPATLA_SECRET_KEY;
    process.env.ISPATLA_SECRET_KEY = "connection-error-vault-key";
    globalThis.fetch = (async () => new Response("fixture-provider-secret-body", { status: 401 })) as unknown as typeof fetch;
    try {
      await runAsOwner("connection-error-owner", async () => {
        saveSecret("openai_api_key", "OpenAI", "error-test-key");
        setAiSettings("api", "gpt-4.1-mini");
        let detail = "";
        try { await testAiConnection(); } catch (error) { detail = String(error); }
        expect(detail).toContain("OpenAI 401");
        expect(detail).not.toContain("fixture-provider-secret-body");
        removeSecret("openai_api_key");
      });
    } finally {
      globalThis.fetch = previousFetch;
      if (previousVault === undefined) delete process.env.ISPATLA_SECRET_KEY;
      else process.env.ISPATLA_SECRET_KEY = previousVault;
    }
  });
});
