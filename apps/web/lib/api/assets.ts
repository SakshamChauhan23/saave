import { KnowledgeAsset, type KnowledgeAsset as KnowledgeAssetType } from "@saave/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Postgres timestamptz → Zod `z.iso.datetime()` (always UTC with `Z` suffix). */
function toIsoDatetime(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

function toIsoDatetimeOrNull(value: unknown): string | null {
  if (value == null) return null;
  return toIsoDatetime(value);
}

export function mapAssetRow(row: Record<string, unknown>): KnowledgeAssetType {
  return KnowledgeAsset.parse({
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    source: row.source,
    status: row.status,
    title: row.title ?? null,
    raw_content: row.raw_content ?? null,
    url: row.url ?? null,
    storage_path: row.storage_path ?? null,
    mime_type: row.mime_type ?? null,
    content_hash: row.content_hash ?? null,
    summary: row.summary ?? null,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    created_at: toIsoDatetime(row.created_at),
    updated_at: toIsoDatetime(row.updated_at),
    deleted_at: toIsoDatetimeOrNull(row.deleted_at),
  });
}

export async function findDuplicateAsset(
  supabase: SupabaseClient,
  userId: string,
  contentHash: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("knowledge_assets")
    .select("id")
    .eq("user_id", userId)
    .eq("content_hash", contentHash)
    .is("deleted_at", null)
    .maybeSingle();

  return data?.id ?? null;
}