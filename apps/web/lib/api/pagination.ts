const PAGE_SIZE = 20;

// decodeAssetCursor's output is interpolated directly into a raw PostgREST
// `.or()` filter string (see app/api/v1/assets/route.ts) — validate shape
// strictly so a crafted cursor can't break out of the intended filter.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pageSize(): number {
  return PAGE_SIZE;
}

/** Keyset cursor for chronological asset lists: base64url("created_at|id"). */
export function encodeAssetCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeAssetCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator === -1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!ISO_DATETIME_RE.test(createdAt) || !UUID_RE.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Offset cursor for FTS search results: base64url("offset:N"). */
export function encodeSearchCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`, "utf8").toString("base64url");
}

export function decodeSearchCursor(cursor: string): number | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!decoded.startsWith("offset:")) return null;
    const offset = Number.parseInt(decoded.slice("offset:".length), 10);
    return Number.isFinite(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}