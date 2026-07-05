-- Add Mistral as a valid ai_provider_keys.provider value. The Phase 2
-- migration (20260705110109) was already applied to production by the time
-- Mistral support was added locally, and Supabase tracks applied migrations
-- by filename/timestamp, not by re-diffing content — editing that file in
-- place after it had already shipped anywhere never gets re-pushed. Hence a
-- proper follow-up migration instead of another in-place edit.

alter table public.ai_provider_keys
  drop constraint ai_provider_keys_provider_check;

alter table public.ai_provider_keys
  add constraint ai_provider_keys_provider_check
  check (provider in ('anthropic', 'openai', 'mistral'));

create or replace function public.set_ai_provider_key(p_provider text, p_api_key text)
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
