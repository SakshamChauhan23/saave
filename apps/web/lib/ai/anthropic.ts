import { buildExtractionPrompt, parseExtractionResponse, type ExtractedMetadata } from "./prompt";

// Anthropic has no embeddings endpoint — an Anthropic key only ever yields
// title/summary/tags, never a search embedding. See lib/ai/extract.ts.
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export async function extractWithAnthropic(
  apiKey: string,
  content: string,
): Promise<ExtractedMetadata> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildExtractionPrompt(content) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((block) => block.type === "text")?.text ?? "";
  return parseExtractionResponse(text);
}
