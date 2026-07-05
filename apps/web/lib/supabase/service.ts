import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. ONLY for the Phase 2 AI
 * extraction background job (lib/ai/extract.ts), which needs it to call
 * get_ai_provider_key() and decrypt the calling user's own Vault secret
 * (only service_role/postgres can read vault.decrypted_secrets — see
 * supabase/migrations/20260705110109_phase2_ai_metadata.sql).
 *
 * This runs after the HTTP response has already been sent (via Next's
 * after()), scoped to a specific user_id/asset_id already established by
 * the request that triggered it — never expose this client, or anything
 * built on it, to a path that takes user_id as untrusted client input.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
