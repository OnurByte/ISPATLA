import { expect, test } from "bun:test";
import { aiModelCapabilities, assertAiModelCapability, codexEnvironment, responseText } from "@/server/ai";

test("advertises supported structured-output tasks and reasoning per built-in model", async () => {
  await expect(aiModelCapabilities("api", "gpt-4.1-mini")).resolves.toMatchObject({
    structuredOutput: true,
    reasoning: false,
    tasks: ["score", "text", "draft_semantics", "connection_test"],
  });
  await expect(aiModelCapabilities("api", "unknown-model")).resolves.toBeNull();
  await expect(aiModelCapabilities("compatible", "not a model")).resolves.toBeNull();
  await expect(assertAiModelCapability("api", "gpt-4.1-mini", "text")).resolves.toMatchObject({ reasoning: false });
  await expect(assertAiModelCapability("api", "gpt-4.1-mini", "unknown" as never)).rejects.toThrow("does not support");
});

test("limits Codex subprocess environment and extracts structured provider text", () => {
  expect(codexEnvironment({ PATH: "/bin", OPENAI_API_KEY: "must-not-pass", HOME: "/tmp" })).toEqual({ PATH: "/bin", HOME: "/tmp" });
  expect(responseText({ output: [{ content: [{ text: " {\"ok\":true} " }] }] })).toBe("{\"ok\":true}");
  expect(responseText({ output_text: "" })).toBeNull();
});
