import { z } from "zod";

/**
 * Single source of truth for the Knowledge Asset shape and the /api/v1/*
 * request/response contracts. Consumed by apps/web today, and by
 * apps/extension (Phase 3) and the native apps' generated API docs (Phase 4).
 */

export const KnowledgeAssetType = z.enum(["url", "text", "pdf", "image"]);
export type KnowledgeAssetType = z.infer<typeof KnowledgeAssetType>;

export const KnowledgeAssetSource = z.enum([
  "web_pwa",
  "chrome_extension",
  "ios_share",
  "android_share",
  "api",
]);
export type KnowledgeAssetSource = z.infer<typeof KnowledgeAssetSource>;

export const KnowledgeAssetStatus = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);
export type KnowledgeAssetStatus = z.infer<typeof KnowledgeAssetStatus>;

export const KnowledgeAsset = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  type: KnowledgeAssetType,
  source: KnowledgeAssetSource,
  status: KnowledgeAssetStatus,
  title: z.string().nullable(),
  raw_content: z.string().nullable(),
  url: z.url().nullable(),
  storage_path: z.string().nullable(),
  mime_type: z.string().nullable(),
  content_hash: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
export type KnowledgeAsset = z.infer<typeof KnowledgeAsset>;

/**
 * Body for POST /api/v1/capture when type is "url" or "text".
 * "pdf"/"image" captures are multipart/form-data uploads instead — the file
 * is the primary payload, with `CaptureFileFields` sent as accompanying form
 * fields (JSON schemas don't carry binary data).
 */
export const CaptureRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.url(),
    source: KnowledgeAssetSource.default("web_pwa"),
  }),
  z.object({
    type: z.literal("text"),
    content: z.string().min(1),
    title: z.string().optional(),
    source: KnowledgeAssetSource.default("web_pwa"),
  }),
]);
export type CaptureRequest = z.infer<typeof CaptureRequest>;

export const CaptureFileFields = z.object({
  type: z.enum(["pdf", "image"]),
  source: KnowledgeAssetSource.default("web_pwa"),
});
export type CaptureFileFields = z.infer<typeof CaptureFileFields>;

export const CaptureResponse = z.object({
  asset: KnowledgeAsset,
});
export type CaptureResponse = z.infer<typeof CaptureResponse>;

export const ApiError = z.object({
  error: z.string(),
  existing_asset_id: z.uuid().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const SearchQuery = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchResult = z.object({
  assets: z.array(KnowledgeAsset),
  next_cursor: z.string().nullable(),
});
export type SearchResult = z.infer<typeof SearchResult>;

/**
 * Phase 2 — BYOK AI metadata extraction. Each user brings their own
 * Anthropic or OpenAI API key (encrypted server-side via Supabase Vault);
 * there is no shared/app-wide key. Anthropic has no embeddings endpoint, so
 * only an OpenAI key yields a semantic-search embedding — Anthropic still
 * gets title/summary/tags.
 */
export const AiProvider = z.enum(["anthropic", "openai"]);
export type AiProvider = z.infer<typeof AiProvider>;

export const SetAiProviderKeyRequest = z.object({
  provider: AiProvider,
  api_key: z.string().min(1),
});
export type SetAiProviderKeyRequest = z.infer<typeof SetAiProviderKeyRequest>;

export const AiProviderKeyStatus = z.object({
  configured: z.boolean(),
  provider: AiProvider.nullable(),
});
export type AiProviderKeyStatus = z.infer<typeof AiProviderKeyStatus>;
