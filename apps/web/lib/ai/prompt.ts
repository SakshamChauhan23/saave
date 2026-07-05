/** Shared extraction prompt + response parsing for both provider clients. */

const MAX_CONTENT_CHARS = 8000;

export function buildExtractionPrompt(content: string): string {
  return `You are a metadata extraction assistant. Given the captured content below, respond with ONLY a JSON object (no markdown fences, no commentary) with these fields:
- "title": a short, specific title (max 80 characters)
- "summary": a 1-2 sentence summary (max 300 characters)
- "tags": an array of 2-5 short lowercase topical tags

Content:
"""
${content.slice(0, MAX_CONTENT_CHARS)}
"""`;
}

export interface ExtractedMetadata {
  title: string | null;
  summary: string | null;
  tags: string[];
}

export function parseExtractionResponse(raw: string): ExtractedMetadata {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model response");

  const parsed: unknown = JSON.parse(match[0]);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response JSON was not an object");
  }
  const obj = parsed as Record<string, unknown>;

  return {
    title: typeof obj.title === "string" ? obj.title.slice(0, 200) : null,
    summary: typeof obj.summary === "string" ? obj.summary.slice(0, 1000) : null,
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string").slice(0, 8)
      : [],
  };
}
