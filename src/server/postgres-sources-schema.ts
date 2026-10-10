import { bigint, bigserial, doublePrecision, foreignKey, index, integer, pgSchema, primaryKey, smallint, text, unique } from "drizzle-orm/pg-core";
import { accounts, authUser, categories } from "@/server/postgres-schema";

const app = pgSchema("ispatla_app");

export const sources = app.table("sources", {
  id: bigserial("id", { mode: "number" }).primaryKey(), handle: text("handle").notNull().unique(), name: text("name").notNull().default(""),
  enabled: smallint("enabled").notNull().default(1), maxPosts: integer("max_posts").notNull().default(20), rightsStatus: text("rights_status").notNull().default("unknown"),
  profileJson: text("profile_json").notNull().default("{}"), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export const accountSources = app.table("account_sources", {
  accountId: bigint("account_id", { mode: "number" }).notNull().references(() => accounts.id, { onDelete: "cascade" }), sourceHandle: text("source_handle").notNull().references(() => sources.handle, { onDelete: "cascade" }), enabled: smallint("enabled").notNull().default(1),
  maxPosts: integer("max_posts").notNull().default(20), rightsStatus: text("rights_status").notNull().default("unknown"), nameOverride: text("name_override").notNull().default(""),
  niche: text("niche").notNull().default(""), topicsJson: text("topics_json").notNull().default("[]"), tone: text("tone").notNull().default(""), pinned: smallint("pinned").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.accountId, table.sourceHandle] })]);
export const accountSourceCategories = app.table("account_source_categories", {
  accountId: bigint("account_id", { mode: "number" }).notNull(), sourceHandle: text("source_handle").notNull(), categoryId: bigint("category_id", { mode: "number" }).notNull().references(() => categories.id, { onDelete: "cascade" }),
  monitoringTier: text("monitoring_tier").notNull().default("C"), discoveryWeight: doublePrecision("discovery_weight").notNull().default(1),
  categoryReputation: doublePrecision("category_reputation"), enabled: smallint("enabled").notNull().default(1), lastEvidenceAt: bigint("last_evidence_at", { mode: "number" }).notNull().default(0),
}, (table) => [primaryKey({ columns: [table.accountId, table.sourceHandle, table.categoryId] }),
  foreignKey({ columns: [table.accountId, table.sourceHandle], foreignColumns: [accountSources.accountId, accountSources.sourceHandle] }).onDelete("cascade"),
  index("account_source_categories_lookup_idx").on(table.accountId, table.sourceHandle, table.enabled)]);
export const competitors = app.table("competitors", {
  id: bigserial("id", { mode: "number" }).primaryKey(), ownerUserId: text("owner_user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }), handle: text("handle").notNull(),
  name: text("name").notNull().default(""), category: text("category").notNull().default(""), enabled: smallint("enabled").notNull().default(1),
  initializedAt: bigint("initialized_at", { mode: "number" }).notNull().default(0), lastSuccessAt: bigint("last_success_at", { mode: "number" }).notNull().default(0),
  lastError: text("last_error").notNull().default(""), createdAt: bigint("created_at", { mode: "number" }).notNull(), updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [unique("competitors_owner_handle_unique").on(table.ownerUserId, table.handle)]);
export const observedPosts = app.table("observed_posts", {
  id: bigserial("id", { mode: "number" }).primaryKey(), externalId: text("external_id").notNull().unique(), sourceHandle: text("source_handle").notNull(),
  authorHandle: text("author_handle").notNull().default(""), statusUrl: text("status_url").notNull().default(""), text: text("text").notNull().default(""),
  createdTimestamp: bigint("created_timestamp", { mode: "number" }).notNull().default(0), likes: bigint("likes", { mode: "number" }).notNull().default(0),
  replies: bigint("replies", { mode: "number" }).notNull().default(0), reposts: bigint("reposts", { mode: "number" }).notNull().default(0), quotes: bigint("quotes", { mode: "number" }).notNull().default(0),
  views: bigint("views", { mode: "number" }).notNull().default(0), authorFollowers: bigint("author_followers", { mode: "number" }).notNull().default(0),
  authorBlueCheckStatus: text("author_blue_check_status").notNull().default("unknown"), authorVerificationStatus: text("author_verification_status").notNull().default("unknown"),
  mediaCount: integer("media_count").notNull().default(0), mediaJson: text("media_json").notNull().default("[]"), rawJson: text("raw_json").notNull().default("{}"),
  score: doublePrecision("score").notNull().default(0), scoreReason: text("score_reason").notNull().default(""), sensitive: smallint("sensitive").notNull().default(0),
  clusterKey: text("cluster_key").notNull().default(""), draftStatus: text("draft_status").notNull().default("not_started"), draftText: text("draft_text").notNull().default(""),
  publishStatus: text("publish_status").notNull().default("not_started"), observedAt: bigint("observed_at", { mode: "number" }).notNull(),
  relevanceScore: doublePrecision("relevance_score"), relevanceSource: text("relevance_source"), relevanceJson: text("relevance_json"), relevanceAt: bigint("relevance_at", { mode: "number" }),
}, (table) => [index("observed_posts_score_idx").on(table.score, table.observedAt), index("observed_posts_cluster_idx").on(table.clusterKey, table.publishStatus)]);
