import { createServiceClient } from "@/lib/supabase/service";
import { extractWithAnthropic } from "./anthropic";
import { embedWithOpenAi, extractWithOpenAi } from "./openai";
import type { AiProvider } from "@saave/shared-types";

interface ProviderKeyRow {
  provider: AiProvider;
  api_key: string;
}

/**
 * Runs after a text/url capture's HTTP response has already been sent (see
 * apps/web/app/api/v1/capture/route.ts's `after()` call). If the capturing
 * user hasn't configured an AI provider key, this does nothing — capture
 * always succeeds and stays fully usable with or without AI enrichment
 * ("AI assists, never interrupts"). Errors are caught and recorded on the
 * row rather than thrown, since there's no request left to fail.
 */
export async function extractMetadata(assetId: string, userId: string, content: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: keyRows, error: keyError } = await supabase.rpc("get_ai_provider_key", {
    p_user_id: userId,
  });

  if (keyError) {
    console.error(`[ai-extract] failed to look up provider key for user ${userId}:`, keyError.message);
    return;
  }

  const keyRow = (keyRows as ProviderKeyRow[] | null)?.[0];
  if (!keyRow) {
    // No key configured — leave the asset exactly as captured.
    return;
  }

  const { provider, api_key: apiKey } = keyRow;

  try {
    const extracted =
      provider === "anthropic"
        ? await extractWithAnthropic(apiKey, content)
        : await extractWithOpenAi(apiKey, content);

    // Only OpenAI offers an embeddings endpoint.
    const embedding = provider === "openai" ? await embedWithOpenAi(apiKey, content) : null;

    await mergeAndUpdate(supabase, assetId, userId, {
      title: extracted.title ?? undefined,
      summary: extracted.summary,
      tags: extracted.tags,
      embedding,
      ai: { status: "done", provider },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ai-extract] extraction failed for asset ${assetId}:`, message);

    await mergeAndUpdate(supabase, assetId, userId, {
      ai: { status: "failed", provider, error: message.slice(0, 500) },
    });
  }
}

async function mergeAndUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  assetId: string,
  userId: string,
  fields: {
    title?: string;
    summary?: string | null;
    tags?: string[];
    embedding?: number[] | null;
    ai: { status: "done" | "failed"; provider: AiProvider; error?: string };
  },
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from("knowledge_assets")
    .select("metadata")
    .eq("id", assetId)
    .single();

  if (selectError) {
    console.error(`[ai-extract] failed to read metadata for asset ${assetId}:`, selectError.message);
    return;
  }

  const existingMetadata = (existing?.metadata as Record<string, unknown> | null) ?? {};

  const { ai, ...rest } = fields;
  const { error: updateError } = await supabase
    .from("knowledge_assets")
    .update({
      ...rest,
      metadata: { ...existingMetadata, ai },
    })
    .eq("id", assetId)
    .eq("user_id", userId);

  if (updateError) {
    console.error(`[ai-extract] failed to write results for asset ${assetId}:`, updateError.message);
  }
}
