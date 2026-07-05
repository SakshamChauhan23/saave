import * as cheerio from "cheerio";

export async function fetchUrlTitle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SaaveBot/1.0 (+https://saave.app)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const title =
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      null;

    return title || null;
  } catch {
    return null;
  }
}