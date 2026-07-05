import { KnowledgeAsset, SearchQuery, SearchResult } from "@saave/shared-types";
import { mapAssetRow } from "@/lib/api/assets";
import {
  decodeSearchCursor,
  encodeSearchCursor,
} from "@/lib/api/pagination";
import { jsonError, unauthorized } from "@/lib/api/response";
import { getSessionUser } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const { supabase } = session;
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = SearchQuery.safeParse(params);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid search query", 400);
  }

  const { q, limit, cursor } = parsed.data;
  const offset = cursor ? decodeSearchCursor(cursor) : 0;
  if (cursor && offset === null) return jsonError("Invalid cursor", 400);

  const { data, error } = await supabase
    .from("knowledge_assets")
    .select("*")
    .is("deleted_at", null)
    .textSearch("search_vector", q, { type: "websearch", config: "english" })
    .order("created_at", { ascending: false })
    .range(offset!, offset! + limit);

  if (error) return jsonError(error.message, 500);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const assets = page.map((row) => KnowledgeAsset.parse(mapAssetRow(row)));

  const next_cursor = hasMore ? encodeSearchCursor(offset! + limit) : null;
  const result: SearchResult = { assets, next_cursor };

  return NextResponse.json(SearchResult.parse(result));
}