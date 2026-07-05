import { KnowledgeAsset } from "@saave/shared-types";
import { mapAssetRow } from "@/lib/api/assets";
import {
  decodeAssetCursor,
  encodeAssetCursor,
  pageSize,
} from "@/lib/api/pagination";
import { jsonError, unauthorized } from "@/lib/api/response";
import { getSessionUser } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const { supabase } = session;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limit = pageSize();

  let query = supabase
    .from("knowledge_assets")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    const decoded = decodeAssetCursor(cursor);
    if (!decoded) return jsonError("Invalid cursor", 400);
    query = query.or(
      `created_at.lt."${decoded.createdAt}",and(created_at.eq."${decoded.createdAt}",id.lt."${decoded.id}")`,
    );
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const assets = page.map((row) => KnowledgeAsset.parse(mapAssetRow(row)));

  const last = page.at(-1);
  const next_cursor =
    hasMore && last ? encodeAssetCursor(String(last.created_at), String(last.id)) : null;

  return NextResponse.json({ assets, next_cursor });
}