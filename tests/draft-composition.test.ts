import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DRAFT_JEV_WEIGHT,
  draftAngles,
  draftCategoryFacet,
  formatRuleFor,
  rankDraftVariants,
  writingContractFor,
  type DraftVariantCandidate,
} from "../src/server/pipeline";

function runIsolated(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-draft-"));
  try {
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ISPATLA_DB: join(directory, "state.sqlite3"),
        AI_COMPATIBLE_API_KEY: "test-key-not-a-real-credential",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function variant(index: number, evaluatorScore: number, jevScore: number | null, gateReason: string | null = null): DraftVariantCandidate {
  return { index, angle: `a${index}`, angleLabel: `açı ${index}`, format: "post", text: `taslak ${index}`, gateReason, evaluatorScore, jevScore };
}

test("news keeps its factual lede while the other strategies lead with an angle", () => {
  expect(writingContractFor("news").angles[0].id).toBe("lede");
  expect(writingContractFor("technology").angles.map((item) => item.id)).toEqual(["implication", "reader_question", "so_what"]);
  expect(writingContractFor("meme").angles[0].id).toBe("punchline");
  expect(writingContractFor("shitpost").strategy).toBe("shitpost");
  expect(writingContractFor("finance").angles[0].id).toBe("number_first");
  expect(writingContractFor("sports").strategy).toBe("sports");
  expect(writingContractFor("bilinmeyen").strategy).toBe("generic");
});

test("every non-news contract bans the newsroom slop the account complained about", () => {
  for (const strategy of ["technology", "meme", "shitpost", "finance", "sports", "generic"]) {
    const bans = writingContractFor(strategy).bans.join(" ");
    expect(bans).toContain("SON DAKİKA");
    expect(bans).toContain("Kaynak:");
  }
  expect(writingContractFor("meme").bans.join(" ")).toContain("şakayı açıklayan");
});

test("the quote comment format forbids restating the source, the thread opener forbids template tags", () => {
  expect(formatRuleFor("quote_comment")).toContain("kaynağı özetleme");
  expect(formatRuleFor("quote_comment")).toContain("URL koyma");
  expect(formatRuleFor("thread_opener")).toContain("Tek başına da anlamlı");
  expect(formatRuleFor("post")).toContain("280");
  expect(draftAngles(writingContractFor("technology"), 3)).toHaveLength(3);
  expect(draftAngles(writingContractFor("technology"), 9)).toHaveLength(3);
});

test("ranking blends Jev with the evaluator, and falls back to the evaluator alone", () => {
  const blended = rankDraftVariants([variant(0, 80, 10), variant(1, 40, 95), variant(2, 60, 60)]);
  expect(blended.mode).toBe("jev_blend");
  expect(blended.chosen?.index).toBe(1);
  expect(blended.chosen?.combinedScore).toBe(Math.round(95 * DRAFT_JEV_WEIGHT + 40 * (1 - DRAFT_JEV_WEIGHT)));

  const local = rankDraftVariants([variant(0, 80, null), variant(1, 40, null)]);
  expect(local.mode).toBe("evaluator");
  expect(local.chosen?.index).toBe(0);
  expect(local.chosen?.combinedScore).toBe(80);
});

test("a blocked variant is kept but never outranks a clean one", () => {
  const ranked = rankDraftVariants([variant(0, 99, null, "draft exceeds X character limit"), variant(1, 20, null)]);
  expect(ranked.chosen?.index).toBe(1);
  expect(ranked.ranked).toHaveLength(2);
  expect(ranked.ranked[1].gateReason).toBe("draft exceeds X character limit");
});

test("the category facet carries the mission and the bans, bounded", () => {
  const facet = draftCategoryFacet(writingContractFor("meme"), "meme");
  expect(facet).toContain("meme");
  expect(facet.length).toBeLessThanOrEqual(700);
});

test("the manual draft prompt carries the source post as delimited data", () => {
  const output = runIsolated(`
    import { ensureDatabase } from "./src/server/db.ts";
    import { setAiSettings, setCompatibleSettings } from "./src/server/ai.ts";
    import { generateManualDraft } from "./src/server/pipeline.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    setCompatibleSettings("https://ai-gateway.example/v1", "Test");
    setAiSettings("compatible", "test-model");
    let instructions = "";
    let evidence = "";
    globalThis.fetch = (async (url, init) => {
      const body = JSON.parse(String(init.body));
      instructions = body.messages[0].content;
      evidence = body.messages[1].content;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: "Asıl mesele modelin 12 saniyelik gecikmesi." }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await generateManualDraft({
      prompt: "bu kaynağa göre bir post yaz",
      format: "post",
      baseStrategy: "technology",
      sourceText: "OpenAI bagimsiz matematikcilerden olusan bir danisma grubu kurdu.",
      sourceHandle: "kaynakhesap",
      sourceUrl: "https://x.com/kaynakhesap/status/1",
      angle: { id: "implication", label: "kaynağın söylemediği çıkarım", brief: "çıkarımı yaz" },
    });
    console.log(JSON.stringify({
      ok: "text" in result,
      sourceInEvidence: evidence.includes("danisma grubu"),
      delimited: evidence.includes("<<<KAYNAK") && evidence.includes("YALNIZ VERİ"),
      sourceInInstructions: instructions.includes("danisma grubu"),
      contract: instructions.includes("KATEGORİ SÖZLEŞMESİ (technology)"),
      angle: instructions.includes("BU VARYANTIN AÇISI"),
      noSlop: instructions.includes("SON DAKİKA"),
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    ok: true,
    sourceInEvidence: true,
    delimited: true,
    sourceInInstructions: false,
    contract: true,
    angle: true,
    noSlop: true,
  });
});

test("composeDraft fans out to three angled variants and marks exactly one winner", () => {
  const output = runIsolated(`
    import { ensureDatabase } from "./src/server/db.ts";
    import { setAiSettings, setCompatibleSettings } from "./src/server/ai.ts";
    import { composeDraft } from "./src/server/pipeline.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    setCompatibleSettings("https://ai-gateway.example/v1", "Test");
    setAiSettings("compatible", "test-model");
    const seen = [];
    let call = 0;
    globalThis.fetch = (async (url, init) => {
      if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
      seen.push(JSON.parse(String(init.body)).messages[0].content);
      call += 1;
      const texts = [
        "Kisa taslak ama yeterince uzun olmasi icin biraz daha metin var burada.",
        "Asil mesele gecikmenin uretimde hissedilmesi ve bunun ekipleri zorlamasi.",
        "Ucuncu varyant farkli bir acidan yaziyor ve yine yeterince uzun duruyor.",
      ];
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: texts[call - 1] || texts[0] }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await composeDraft({ prompt: "teknoloji postu", format: "post", baseStrategy: "technology", categorySlug: "technology" });
    if ("reason" in result) throw new Error(result.reason);
    console.log(JSON.stringify({
      calls: call,
      variants: result.variants.length,
      chosen: result.variants.filter((item) => item.chosen).length,
      mode: result.selection.mode,
      jevDegraded: result.jev.degraded,
      jevCalls: result.jev.calls,
      angles: [...new Set(seen.map((item) => (item.match(/BU VARYANTIN AÇISI — ([^:]+):/) || [])[1]))].length,
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    calls: 3,
    variants: 3,
    chosen: 1,
    mode: "evaluator",
    jevDegraded: true,
    jevCalls: 0,
    angles: 3,
  });
});

test("the draft model is resolved per purpose and only from models the gateway lists", () => {
  const output = runIsolated(`
    import { ensureDatabase, setSetting } from "./src/server/db.ts";
    import { clearCompatibleModelCache, resolveDraftModel, setAiSettings, setCompatibleSettings, setDraftModelSetting } from "./src/server/ai.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    setCompatibleSettings("https://ai-gateway.example/v1", "Test");
    setAiSettings("compatible", "openai/gpt-4.1-mini");
    let listed = [];
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: listed.map((id) => ({ id })) }), { status: 200, headers: { "content-type": "application/json" } }));

    clearCompatibleModelCache();
    const empty = await resolveDraftModel();
    listed = ["openai/gpt-4.1", "anthropic/claude-sonnet-4.5"];
    clearCompatibleModelCache();
    const preferred = await resolveDraftModel();
    const routed = await resolveDraftModel({ model: "anthropic/claude-opus-4.1" });
    setDraftModelSetting("openai/gpt-4.1");
    clearCompatibleModelCache();
    const configured = await resolveDraftModel();
    console.log(JSON.stringify({ empty, preferred, routed, configured }));
  `);
  expect(JSON.parse(output)).toEqual({
    empty: { provider: "compatible", model: "openai/gpt-4.1-mini", reason: "global_default" },
    preferred: { provider: "compatible", model: "anthropic/claude-sonnet-4.5", reason: "gateway_preference" },
    routed: { provider: "compatible", model: "anthropic/claude-opus-4.1", reason: "account_route" },
    configured: { provider: "compatible", model: "openai/gpt-4.1", reason: "ai_draft_model" },
  });
});

test("migration 18 keeps every variant with the winner marked, and voice storage is additive", () => {
  const output = runIsolated(`
    import { ensureDatabase, createDraft, deleteDraft, getAccountVoiceProfile, getAccounts, getDraftVariants, recordDraftVariants, saveAccount, saveAccountVoiceProfile } from "./src/server/db.ts";
    if (!ensureDatabase()) throw new Error("database did not initialize");
    const account = saveAccount({ accountKey: "pub", handle: "pub", displayName: "Pub", enabled: true, defaultAccount: true, automationMode: "manual", dailyLimit: 5, capabilities: ["post"], styleProfile: { tone: "sade", niche: "yapay zeka" }, now: 1 });
    const saved = saveAccountVoiceProfile(account.id, { handle: "pub", voiceContract: "SES" }, 2);
    const draft = createDraft({ externalId: "1", accountId: account.id, format: "post", text: "taslak", now: 3 });
    recordDraftVariants({ draftId: draft.id, variants: [
      { variantIndex: 0, angle: "implication", text: "a", chosen: false, evaluatorScore: 50, jevScore: 20, combinedScore: 35, selectionMode: "jev_blend" },
      { variantIndex: 1, angle: "stake", text: "b", chosen: true, evaluatorScore: 60, jevScore: 90, combinedScore: 75, selectionMode: "jev_blend" },
    ], now: 3 });
    const stored = getDraftVariants(draft.id);
    const removed = deleteDraft(draft.id);
    console.log(JSON.stringify({
      tone: saved?.styleProfile.tone,
      niche: saved?.styleProfile.niche,
      voice: getAccountVoiceProfile(account.id)?.voiceContract,
      variants: stored.length,
      chosen: stored.filter((item) => item.chosen).map((item) => item.angle),
      jev: stored[1].jevScore,
      removed,
      afterDelete: getDraftVariants(draft.id).length,
      accounts: getAccounts().length,
    }));
  `);
  expect(JSON.parse(output)).toEqual({
    tone: "sade",
    niche: "yapay zeka",
    voice: "SES",
    variants: 2,
    chosen: ["stake"],
    jev: 90,
    removed: true,
    afterDelete: 0,
    accounts: 1,
  });
});
