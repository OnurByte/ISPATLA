import { McpServer, type StandardSchemaWithJSON, type ToolCallback } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createManualDraftBatch } from "./manual-drafts";
import { cancelPublicationIntent, createIntentForDraft } from "./publication-service";
import { getPostgresPublicationIntent, listPostgresPublicationIntents } from "./postgres-queue-store";
import { getAuth, isAuthenticatedUserDisabled } from "./auth";
import { currentOwnerId, runAsOwner } from "./owner-context";
import { getPostgresDraft, setPostgresDraftDecision } from "./postgres-drafts";
import { getPostgresMarketInbox } from "./postgres-sources-market";
import { PUBLISHING_METHODS, preparePublication, publicationStatus, attachPublicationReceipt } from "./publishing-preparation";
import { getPostgresAnalytics } from "./postgres-analytics";
import { getPostgresAccounts } from "./postgres-accounts";
import { analyzeLinkedAccount, linkPublicAccount } from "./account-link";
import { loadSourceCatalog } from "./source-catalog";

const output = z.object({ data: z.unknown() });
const limit = z.number().int().min(1).max(100).default(20);

type Session = { user: { id: string } } | null;
type SessionResolver = () => Promise<Session>;
type ToolOutput = ReturnType<typeof result>;
type ToolConfig<Schema extends StandardSchemaWithJSON> = {
  title: string;
  description: string;
  inputSchema: Schema;
  outputSchema: typeof output;
  annotations: { readOnlyHint: boolean };
};

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: { data } };
}

async function configuredSession(): Promise<Session> {
  const configuredCookie = process.env.ISPATLA_MCP_SESSION_COOKIE?.trim();
  if (!configuredCookie) return null;
  const cookie = configuredCookie.includes("=")
    ? configuredCookie
    : `${process.env.NODE_ENV === "production" ? "__Secure-" : ""}better-auth.session_token=${configuredCookie}`;
  const session = await (await getAuth()).api.getSession({ headers: new Headers({ cookie }) });
  return session && !await isAuthenticatedUserDisabled(session.user.id) ? session : null;
}

function registerOwnerTool<Schema extends StandardSchemaWithJSON & z.ZodType>(
  server: McpServer,
  resolveSession: SessionResolver,
  name: string,
  config: ToolConfig<Schema>,
  authorizeTool: ((name: string, readOnly: boolean) => void) | undefined,
  handler: (input: z.infer<Schema>) => ToolOutput | Promise<ToolOutput>,
): void {
  const protectedHandler = async (input: z.infer<Schema>) => {
    authorizeTool?.(name, config.annotations.readOnlyHint);
    const session = await resolveSession();
    const ownerId = session?.user.id;
    if (!ownerId) throw new Error("authentication required");
    return runAsOwner(ownerId, () => handler(input));
  };
  server.registerTool<typeof output, Schema>(name, config, protectedHandler as ToolCallback<Schema>);
}

function sharedPost<Post extends { draftText?: string; draftStatus?: string; publishStatus?: string }>(post: Post | null): Omit<Post, "draftText" | "draftStatus" | "publishStatus"> | null {
  if (!post) return null;
  const { draftText: _draftText, draftStatus: _draftStatus, publishStatus: _publishStatus, ...shared } = post;
  void _draftText;
  void _draftStatus;
  void _publishStatus;
  return shared;
}

export function createIspatlaMcpServer(options: { resolveSession?: SessionResolver; authorizeTool?: (name: string, readOnly: boolean) => void } = {}): McpServer {
  const resolveSession = options.resolveSession || configuredSession;
  const server = new McpServer({ name: "ispatla", version: "0.1.0" });
  registerOwnerTool(server, resolveSession, "ispatla.opportunities.list", { title: "Fırsatları listele", description: "PostgreSQL'de bulunan ISPATLA fırsatlarını döndürür.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async ({ limit }) => result({ items: (await getPostgresMarketInbox(currentOwnerId()!, { view: "opportunities", limit })).items.map(sharedPost), limit }));
  registerOwnerTool(server, resolveSession, "ispatla.opportunity.inspect", { title: "Fırsatı incele", description: "PostgreSQL'de bulunan bir fırsat postunun kanıt ve metriklerini döndürür.", inputSchema: z.object({ externalId: z.string().min(1).max(64) }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async ({ externalId }) => result({ item: sharedPost((await getPostgresMarketInbox(currentOwnerId()!, { view: "observed", limit: 100 })).items.find((item) => item.externalId === externalId) || null) }));
  registerOwnerTool(server, resolveSession, "ispatla.sources.list", { title: "Kaynakları listele", description: "Genel kaynak keşif kataloğunu döndürür.", inputSchema: z.object({ enabledOnly: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, ({ enabledOnly }) => result({ items: loadSourceCatalog().filter((source) => !enabledOnly || source.enabled) }));
  registerOwnerTool(server, resolveSession, "ispatla.sources.health", { title: "Kaynak sağlığı", description: "Kullanıcının seçili kaynaklarında kaydedilmiş gözlemleri döndürür; canlı sağlayıcı sağlığı iddiası değildir.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async ({ limit }) => result({ evidence: "stored_observations", items: (await getPostgresMarketInbox(currentOwnerId()!, { view: "observed", limit })).items.map(sharedPost) }));
  registerOwnerTool(server, resolveSession, "ispatla.drafts.generate", { title: "Draft üret", description: "Metin verilirse AI çağrısı yapmadan draft üretir; aksi durumda etkin AI ayarını kullanır.", inputSchema: z.object({ prompt: z.string().max(6000).optional(), text: z.string().max(280).optional(), accountIds: z.array(z.number().int().positive()).max(20).optional(), format: z.enum(["post", "quote", "reply", "thread", "dm"]).optional(), variantMode: z.enum(["per_account", "same_text"]).optional(), externalId: z.string().max(64).optional(), sourceUrl: z.string().url().optional() }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async (input) => result(await createManualDraftBatch(input)));
  registerOwnerTool(server, resolveSession, "ispatla.drafts.review", { title: "Draft gözden geçir", description: "Onay veya red kararını uygular; post draftı yalnız ready durumuna döner.", inputSchema: z.object({ draftId: z.number().int().positive(), decision: z.enum(["approve", "reject"]), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ draftId, decision, confirm }) => {
    const draft = await getPostgresDraft(draftId);
    if (!draft) throw new Error("draft bulunamadı");
    if (!confirm) return result({ requiresConfirmation: true, draft, decision });
    return result({ draft: await setPostgresDraftDecision({ id: draftId, status: decision === "approve" ? "ready" : "blocked", gateReason: decision === "approve" ? "ajan incelemesi" : "ajan reddi" }) });
  });
  registerOwnerTool(server, resolveSession, "ispatla.publications.queue", { title: "Yayını kuyruğa al", description: "Önce pending PublicationIntent üretir; onay yalnız kullanıcıya ait web ekranında verilir.", inputSchema: z.object({ draftId: z.number().int().positive(), accountId: z.number().int().positive().optional(), intentId: z.number().int().positive().optional(), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ draftId, accountId, intentId, confirm }) => {
    const intent = intentId ? await getPostgresPublicationIntent(intentId) : await createIntentForDraft(draftId, accountId);
    if (!intent) throw new Error("publication intent bulunamadı");
    if (intent.draftId !== draftId || (accountId !== undefined && intent.accountId !== accountId)) throw new Error("intent target mismatch");
    if (!confirm) return result({ requiresWebApproval: true, intent, reviewUrl: `/queue?intentId=${intent.id}` });
    if (intent.draftId !== draftId) throw new Error("intent ve draft eşleşmiyor");
    return result({ requiresWebApproval: true, intent, reviewUrl: `/queue?intentId=${intent.id}` });
  });
  registerOwnerTool(server, resolveSession, "ispatla.publications.cancel", { title: "Yayını iptal et", description: "Bir PublicationIntent'i ikinci, confirm=true çağrısında iptal eder.", inputSchema: z.object({ intentId: z.number().int().positive(), confirm: z.boolean().default(false) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ intentId, confirm }) => {
    const intent = await getPostgresPublicationIntent(intentId);
    if (!intent) throw new Error("publication intent bulunamadı");
    return result(confirm ? { intent: await cancelPublicationIntent(intentId) } : { requiresConfirmation: true, intent });
  });
  registerOwnerTool(server, resolveSession, "ispatla.analytics.performance", { title: "Performans analitiği", description: "Kullanıcıya ait yayın özetini ve veri kapsamını döndürür.", inputSchema: z.object({ rangeDays: z.union([z.literal(7), z.literal(14)]).default(14), accountId: z.number().int().positive().optional() }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async (input) => result(await getPostgresAnalytics(currentOwnerId()!, input)));
  registerOwnerTool(server, resolveSession, "ispatla.failures.list", { title: "Arızaları listele", description: "Bu kullanıcının müdahale bekleyen yayın niyetlerini döndürür.", inputSchema: z.object({ limit }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async ({ limit }) => result({ intents: (await listPostgresPublicationIntents(limit)).filter((intent) => ["blocked", "reconciliation_required"].includes(intent.status)) }));
  registerOwnerTool(server, resolveSession, "ispatla.accounts.list", { title: "Accounts", description: "Owned public account links and analysis.", inputSchema: z.object({}), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async () => result(await getPostgresAccounts(currentOwnerId()!)));
  registerOwnerTool(server, resolveSession, "ispatla.accounts.add", { title: "Add public account", description: "Links a public handle and analyzes it without asserting ownership.", inputSchema: z.object({ handle: z.string().min(1).max(16) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ handle }) => result(await linkPublicAccount(handle)));
  registerOwnerTool(server, resolveSession, "ispatla.accounts.analyze", { title: "Analyze account", description: "Refreshes categories and writing style while preserving manual settings.", inputSchema: z.object({ accountId: z.number().int().positive() }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ accountId }) => result(await analyzeLinkedAccount(accountId)));
  registerOwnerTool(server, resolveSession, "ispatla.publishing.methods", { title: "Publishing methods", description: "Available user-operated sharing methods. Automatic publishing is disabled.", inputSchema: z.object({}), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, () => result({ methods: PUBLISHING_METHODS, automatic: false }));
  registerOwnerTool(server, resolveSession, "ispatla.publications.prepare", { title: "Prepare publication", description: "Prepares a verified-account share for user action; does not publish.", inputSchema: z.object({ draftId: z.number().int().positive(), method: z.enum(PUBLISHING_METHODS) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ draftId, method }) => result(await preparePublication(draftId, method)));
  registerOwnerTool(server, resolveSession, "ispatla.publications.status", { title: "Publication status", description: "Owned preparation status with evidence level.", inputSchema: z.object({ id: z.string().uuid() }), outputSchema: output, annotations: { readOnlyHint: true } }, options.authorizeTool, async ({ id }) => result(await publicationStatus(id)));
  registerOwnerTool(server, resolveSession, "ispatla.publications.attach_receipt", { title: "Observe publication", description: "Checks a public receipt without claiming official verification.", inputSchema: z.object({ id: z.string().uuid(), url: z.string().url().max(2048) }), outputSchema: output, annotations: { readOnlyHint: false } }, options.authorizeTool, async ({ id, url }) => result(await attachPublicationReceipt(id, url)));
  return server;
}
