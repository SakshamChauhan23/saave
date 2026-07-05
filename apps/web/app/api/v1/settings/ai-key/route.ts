import { AiProviderKeyStatus, SetAiProviderKeyRequest } from "@saave/shared-types";
import { jsonError, unauthorized } from "@/lib/api/response";
import { getSessionUser } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// All three handlers run as the calling user's RLS-scoped client (never
// service-role) — the security-definer RPCs in the Phase 2 migration are
// what safely bridge to Vault, keyed off auth.uid() inside the function
// itself. See supabase/migrations/20260705110109_phase2_ai_metadata.sql.

export async function GET() {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const { data, error } = await session.supabase
    .from("ai_provider_keys")
    .select("provider")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);

  const status: AiProviderKeyStatus = {
    configured: !!data,
    provider: data?.provider ?? null,
  };
  return NextResponse.json(AiProviderKeyStatus.parse(status));
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = SetAiProviderKeyRequest.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
  }

  const { provider, api_key } = parsed.data;
  const { error } = await session.supabase.rpc("set_ai_provider_key", {
    p_provider: provider,
    p_api_key: api_key,
  });

  if (error) return jsonError(error.message, 500);

  const status: AiProviderKeyStatus = { configured: true, provider };
  return NextResponse.json(AiProviderKeyStatus.parse(status));
}

export async function DELETE() {
  const session = await getSessionUser();
  if (!session) return unauthorized();

  const { error } = await session.supabase.rpc("delete_ai_provider_key");
  if (error) return jsonError(error.message, 500);

  const status: AiProviderKeyStatus = { configured: false, provider: null };
  return NextResponse.json(AiProviderKeyStatus.parse(status));
}
