import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  getAnalytics, getAutomationLogs, getDraft, getMonitorTargets, getOpportunityItems, getPost,
  getPublicationIntent, getPublicationIntents, getReaderHealth, getStoredSources, updateDraft,
} from "./db";
import { createManualDraftBatch } from "./manual-drafts";
import { cancelPublicationIntent, createIntentForDraft, approvePublicationIntent } from "./publication-service";

const output = z.object({ data: z.unknown() });
const limit = z.number().int().min(1).max(100).default(20);

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: { data } };
}

export function createIspatlaMcpServer(): McpServer {
  const server = new McpServer({ name: "ispatla", version: "0.1.0" });
  server.registerTool("ispatla.opportunities.list", { title: "Fırsatları listele", description: "Skoru 70+ olan ISPATLA fırsatlarını döndürür.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ limit }) => result({ items: getOpportunityItems(limit), limit }));
  server.registerTool("ispatla.opportunity.inspect", { title: "Fırsatı incele", description: "Bir fırsat postunun kanıt ve metriklerini döndürür.", inputSchema: z.object({ externalId: z.string().min(1).max(64) }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ externalId }) => result({ item: getPost(externalId) }));
  server.registerTool("ispatla.sources.list", { title: "Kaynakları listele", description: "Aktif kaynak yapılandırmasını döndürür.", inputSchema: z.object({ enabledOnly: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ enabledOnly }) => result({ items: getStoredSources().filter((source) => !enabledOnly || source.enabled) }));
  server.registerTool("ispatla.sources.health", { title: "Kaynak sağlığı", description: "Reader sağlığı ve monitor durumlarını döndürür.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ limit }) => result({ reader: getReaderHealth(limit), monitors: getMonitorTargets({ limit }) }));
  server.registerTool("ispatla.drafts.generate", { title: "Draft üret", description: "Metin verilirse AI çağrısı yapmadan draft üretir; aksi durumda etkin AI ayarını kullanır.", inputSchema: z.object({ prompt: z.string().max(6000).optional(), text: z.string().max(280).optional(), accountIds: z.array(z.number().int().positive()).max(20).optional(), format: z.enum(["post", "quote", "reply", "thread", "dm"]).optional(), variantMode: z.enum(["per_account", "same_text"]).optional(), externalId: z.string().max(64).optional(), sourceUrl: z.string().url().optional() }), outputSchema: output, annotations: { readOnlyHint: false } }, async (input) => result(await createManualDraftBatch(input)));
  server.registerTool("ispatla.drafts.review", { title: "Draft gözden geçir", description: "Onay veya red kararını uygular; post draftı yalnız ready durumuna döner.", inputSchema: z.object({ draftId: z.number().int().positive(), decision: z.enum(["approve", "reject"]), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, ({ draftId, decision, confirm }) => {
    const draft = getDraft(draftId);
    if (!draft) throw new Error("draft bulunamadı");
    if (!confirm) return result({ requiresConfirmation: true, draft, decision });
    return result({ draft: updateDraft({ id: draftId, status: decision === "approve" ? "ready" : "blocked", gateReason: decision === "approve" ? "insan onayı" : "insan reddi", now: Math.floor(Date.now() / 1000) }) });
  });
  server.registerTool("ispatla.publications.queue", { title: "Yayını kuyruğa al", description: "Önce pending PublicationIntent üretir; aynı intent confirm=true ile onaylanır.", inputSchema: z.object({ draftId: z.number().int().positive(), accountId: z.number().int().positive().optional(), intentId: z.number().int().positive().optional(), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, ({ draftId, accountId, intentId, confirm }) => {
    const intent = intentId ? getPublicationIntent(intentId) : createIntentForDraft(draftId, accountId);
    if (!intent) throw new Error("publication intent bulunamadı");
    if (!confirm) return result({ requiresConfirmation: true, intent });
    if (intent.draftId !== draftId) throw new Error("intent ve draft eşleşmiyor");
    return result({ intent: approvePublicationIntent(intent.id) });
  });
  server.registerTool("ispatla.publications.cancel", { title: "Yayını iptal et", description: "Bir PublicationIntent'i ikinci, confirm=true çağrısında iptal eder.", inputSchema: z.object({ intentId: z.number().int().positive(), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, ({ intentId, confirm }) => {
    const intent = getPublicationIntent(intentId);
    if (!intent) throw new Error("publication intent bulunamadı");
    return result(confirm ? { intent: cancelPublicationIntent(intentId) } : { requiresConfirmation: true, intent });
  });
  server.registerTool("ispatla.analytics.performance", { title: "Performans analitiği", description: "Hesap, yayın ve adaptive monitoring performansını döndürür.", inputSchema: z.object({ rangeDays: z.union([z.literal(7), z.literal(14)]).default(14), accountId: z.number().int().positive().optional() }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ rangeDays, accountId }) => result(getAnalytics({ rangeDays, accountId })));
  server.registerTool("ispatla.failures.list", { title: "Arızaları listele", description: "Başarısız otomasyon ve müdahale bekleyen yayın niyetlerini döndürür.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, ({ limit }) => result({ logs: getAutomationLogs(limit).filter((log) => log.status !== "success"), intents: getPublicationIntents({ limit }).filter((intent) => ["blocked", "reconciliation_required"].includes(intent.status)) }));
  return server;
}
