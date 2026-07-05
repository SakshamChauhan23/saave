import { buildExtractionPrompt, parseExtractionResponse, type ExtractedMetadata } from "./prompt";

const OPENAI_CHAT_MODEL = "gpt-4o-mini";
// 1536 dimensions — matches the knowledge_assets.embedding vector(1536) column.
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_EMBEDDING_INPUT_CHARS = 8000;

export async function extractWithOpenAi(apiKey: string, content: string): Promise<ExtractedMetadata> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages: [{ role: "user", content: buildExtractionPrompt(content) }],
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseExtractionResponse(text);
}

export async function embedWithOpenAi(apiKey: string, content: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: content.slice(0, MAX_EMBEDDING_INPUT_CHARS),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) throw new Error("No embedding returned from OpenAI");
  return embedding;
}
