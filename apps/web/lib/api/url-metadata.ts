import * as cheerio from "cheerio";

export interface UrlMetadata {
  title: string | null;
  /** og:description/meta description, or a short body-text fallback — used
   * as the AI extraction input for url captures (Phase 2), since a title
   * alone isn't enough to meaningfully summarize. */
  excerpt: string | null;
}

const MAX_EXCERPT_CHARS = 1000;

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SaaveBot/1.0 (+https://saave.app)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return { title: null, excerpt: null };

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return { title: null, excerpt: null };

    const html = await res.text();
    const $ = cheerio.load(html);
    const title =
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      null;

    const description =
      $("meta[property='og:description']").attr("content")?.trim() ||
      $("meta[name='description']").attr("content")?.trim() ||
      null;

    const excerpt =
      description ||
      $("body")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_EXCERPT_CHARS) ||
      null;

    return { title: title || null, excerpt: excerpt || null };
  } catch {
    return { title: null, excerpt: null };
  }
}
