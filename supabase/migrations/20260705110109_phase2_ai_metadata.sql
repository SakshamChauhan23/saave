-- Phase 2: AI metadata extraction (BYOK) — pgvector embeddings + encrypted
-- per-user provider API keys. See MEMORY.md > Architecture Decisions.

-- Explicit table grants (fixes a latent Phase 1 gap, surfaced while testing
-- Phase 2 on a rebuilt local instance): this Postgres image's default ACL
-- for schema `public` only grants delete/truncate/references/trigger to
-- anon/authenticated/service_role on tables created by the `postgres` role
-- — NOT select/insert/update, unlike tables created by `supabase_admin`
-- (Supabase's own internal tables). RLS then further restricts rows, but
-- the base table grant has to exist first, or every query 403s with
-- "permission denied for table X" regardless of policy. The hosted
-- production project was provisioned on an image where this wasn't an
-- issue (verified working), so this was never hit there — added here
-- explicitly so it doesn't depend on that default either way.
-- service_role also needs its own explicit grant (bypassing RLS is separate
-- from having the base table privilege at all) — the Phase 2 extraction
-- background job (lib/ai/extract.ts) writes to knowledge_assets using the
-- service-role client.
grant select, insert, update, delete on public.knowledge_assets to authenticated, service_role;
grant select, update on public.profiles to authenticated, service_role;

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- embeddings
-- ---------------------------------------------------------------------------

alter table public.knowledge_assets
  add column embedding vector(1536);

-- HNSW: no training/list-count tuning needed (unlike ivfflat), fine on a
-- near-empty table and scales well as rows are added.
create index knowledge_assets_embedding_idx
  on public.knowledge_assets using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- ai_provider_keys — BYOK: each user's own Anthropic/OpenAI/Mistral key,
-- encrypted at rest via Supabase Vault. The table itself only ever stores a
-- pointer (secret_id) into vault.secrets, never the key material.
-- ---------------------------------------------------------------------------

create table public.ai_provider_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'mistral')),
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_provider_keys_set_updated_at
  before update on public.ai_provider_keys
  for each row execute procedure public.set_updated_at();

alter table public.ai_provider_keys enable row level security;

-- SELECT only — lets the settings UI show "configured: true/provider: X"
-- without exposing the key. All writes go through the security-definer
-- RPCs below (no insert/update/delete policy = denied by default for
-- authenticated/anon), so a client can never point secret_id at a vault
-- secret it doesn't own, or write key material anywhere but through Vault.
create policy "Users can view own ai provider key status"
  on public.ai_provider_keys for select
  using (auth.uid() = user_id);

-- Base table grant for the SELECT policy above to take effect (see the
-- grants note at the top of this file). No insert/update/delete grant for
-- authenticated — all writes go through the security-definer RPCs below,
-- which run as the function owner and bypass this table's grants/RLS
-- entirely (that's the mechanism enforcing "only the RPC can write").
grant select on public.ai_provider_keys to authenticated;

-- Called by the authenticated user (via the normal RLS-respecting client)
-- to set or replace their key. Runs as security definer so it can call
-- vault.create_secret/update_secret despite `authenticated` having no
-- direct grants on the vault schema.
create function public.set_ai_provider_key(p_provider text, p_api_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_secret_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_provider not in ('anthropic', 'openai', 'mistral') then
    raise exception 'invalid provider: %', p_provider;
  end if;
  if p_api_key is null or length(trim(p_api_key)) = 0 then
    raise exception 'api key must not be empty';
  end if;

  select secret_id into v_existing_secret_id
  from public.ai_provider_keys
  where user_id = auth.uid();

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_api_key);
    update public.ai_provider_keys
      set provider = p_provider
      where user_id = auth.uid();
  else
    insert into public.ai_provider_keys (user_id, provider, secret_id)
    values (
      auth.uid(),
      p_provider,
      vault.create_secret(p_api_key, 'ai_provider_key_' || auth.uid()::text)
    );
  end if;
end;
$$;

revoke all on function public.set_ai_provider_key(text, text) from public, anon;
grant execute on function public.set_ai_provider_key(text, text) to authenticated;

-- Called by the authenticated user to remove their key entirely.
create function public.delete_ai_provider_key()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select secret_id into v_secret_id
  from public.ai_provider_keys
  where user_id = auth.uid();

  if v_secret_id is not null then
    delete from public.ai_provider_keys where user_id = auth.uid();
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

revoke all on function public.delete_ai_provider_key() from public, anon;
grant execute on function public.delete_ai_provider_key() to authenticated;

-- Called ONLY by the extraction background job (Next.js `after()` callback
-- using the service-role client — see apps/web/lib/ai/*). Decrypting a Vault
-- secret inherently requires elevated privilege (only `postgres`/
-- `service_role` can read vault.decrypted_secrets), so this function must be
-- security definer; the explicit revoke/grant below is what actually
-- prevents `anon`/`authenticated` callers from ever invoking it — RLS alone
-- wouldn't stop a function call the way it stops a table read.
create function public.get_ai_provider_key(p_user_id uuid)
returns table (provider text, api_key text)
language sql
security definer
set search_path = public, vault
as $$
  select p.provider, v.decrypted_secret
  from public.ai_provider_keys p
  join vault.decrypted_secrets v on v.id = p.secret_id
  where p.user_id = p_user_id;
$$;

revoke all on function public.get_ai_provider_key(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_provider_key(uuid) to service_role;
