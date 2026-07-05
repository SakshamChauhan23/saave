import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CaptureFileFields, CaptureRequest, CaptureResponse } from "@saave/shared-types";
import { findDuplicateAsset, mapAssetRow } from "@/lib/api/assets";
import { hashText, hashUrl, sha256Hex } from "@/lib/api/hash";
import { jsonError, unauthorized } from "@/lib/api/response";
import { fetchUrlMetadata } from "@/lib/api/url-metadata";
import { extractMetadata } from "@/lib/ai/extract";
import { getSessionUser } from "@/lib/supabase/server";
import { NextResponse, after, type NextRequest } from "next/server";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const PDF_MIME = "application/pdf";
const IMAGE_MIME_PREFIX = "image/";

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const { user, supabase } = session;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleFileCapture(request, user.id, supabase);
  }

  return handleJsonCapture(request, user.id, supabase);
}

async function handleJsonCapture(
  request: NextRequest,
  userId: string,
  supabase: SupabaseClient,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = CaptureRequest.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }

  const payload = parsed.data;

  if (payload.type === "url") {
    const contentHash = hashUrl(payload.url);
    const duplicateId = await findDuplicateAsset(supabase, userId, contentHash);
    if (duplicateId) {
      return jsonError("Asset already exists", 409, { existing_asset_id: duplicateId });
    }

    const { title, excerpt } = await fetchUrlMetadata(payload.url);

    const { data, error } = await supabase
      .from("knowledge_assets")
      .insert({
        user_id: userId,
        type: "url",
        source: payload.source,
        status: "ready",
        url: payload.url,
        title,
        content_hash: contentHash,
        metadata: excerpt ? { excerpt } : {},
      })
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    // AI enrichment (Phase 2, BYOK) runs after the response is sent — never
    // blocks capture, and does nothing if the user has no key configured.
    const extractionInput = excerpt ?? title ?? payload.url;
    after(() => extractMetadata(data.id, userId, extractionInput));

    const response: CaptureResponse = { asset: mapAssetRow(data) };
    return NextResponse.json(CaptureResponse.parse(response), { status: 201 });
  }

  const contentHash = hashText(payload.content);
  const duplicateId = await findDuplicateAsset(supabase, userId, contentHash);
  if (duplicateId) {
    return jsonError("Asset already exists", 409, { existing_asset_id: duplicateId });
  }

  const { data, error } = await supabase
    .from("knowledge_assets")
    .insert({
      user_id: userId,
      type: "text",
      source: payload.source,
      status: "ready",
      title: payload.title ?? null,
      raw_content: payload.content,
      content_hash: contentHash,
    })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);

  after(() => extractMetadata(data.id, userId, payload.content));

  const response: CaptureResponse = { asset: mapAssetRow(data) };
  return NextResponse.json(CaptureResponse.parse(response), { status: 201 });
}

async function handleFileCapture(
  request: NextRequest,
  userId: string,
  supabase: SupabaseClient,
) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Invalid form data", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("Missing file upload", 400);
  }

  const fields = CaptureFileFields.safeParse({
    type: formData.get("type"),
    source: formData.get("source") ?? undefined,
  });

  if (!fields.success) {
    return jsonError(fields.error.issues[0]?.message ?? "Invalid file fields", 400);
  }

  const { type, source } = fields.data;
  const mimeType = file.type || (type === "pdf" ? PDF_MIME : "application/octet-stream");

  if (type === "pdf" && mimeType !== PDF_MIME) {
    return jsonError("PDF uploads must use application/pdf", 400);
  }
  if (type === "image" && !mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    return jsonError("Image uploads must use an image/* MIME type", 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    return jsonError("File exceeds 50MB limit", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = sha256Hex(buffer);
  const duplicateId = await findDuplicateAsset(supabase, userId, contentHash);
  if (duplicateId) {
    return jsonError("Asset already exists", 409, { existing_asset_id: duplicateId });
  }

  const assetId = randomUUID();
  const filename = sanitizeFilename(file.name || (type === "pdf" ? "document.pdf" : "image"));
  const storagePath = `${userId}/${assetId}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("knowledge-assets")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) return jsonError(uploadError.message, 500);

  const { data, error } = await supabase
    .from("knowledge_assets")
    .insert({
      id: assetId,
      user_id: userId,
      type,
      source,
      status: "ready",
      title: filename,
      storage_path: storagePath,
      mime_type: mimeType,
      content_hash: contentHash,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from("knowledge-assets").remove([storagePath]);
    return jsonError(error.message, 500);
  }

  const response: CaptureResponse = { asset: mapAssetRow(data) };
  return NextResponse.json(CaptureResponse.parse(response), { status: 201 });
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\-()+ ]/g, "_").trim();
  return cleaned || "file";
}