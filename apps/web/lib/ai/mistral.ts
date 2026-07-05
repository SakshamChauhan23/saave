import { buildExtractionPrompt, parseExtractionResponse, type ExtractedMetadata } from "./prompt";

// Mistral does have an embeddings endpoint (mistral-embed), but it outputs
// 1024-dim vectors — the knowledge_assets.embedding column is a fixed
// vector(1536) matching OpenAI's text-embedding-3-small, and embeddings from
// different models aren't comparable in the same vector space anyway even
// at matching dimensions. So, like Anthropic, Mistral only ever yields
// title/summary/tags here — no embedding. See lib/ai/extract.ts.
const MISTRAL_MODEL = "mistral-small-latest";

export async function extractWithMistral(apiKey: string, content: string): Promise<ExtractedMetadata> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [{ role: "user", content: buildExtractionPrompt(content) }],
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mistral API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseExtractionResponse(text);
}
