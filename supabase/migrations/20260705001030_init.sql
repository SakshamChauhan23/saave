-- Saave Phase 1 schema: profiles, knowledge_assets, RLS, storage bucket.
-- See MEMORY.md > Data Model for the human-readable summary of this schema.

create extension if not exists pgcrypto;

-- to_tsvector(regconfig, text) is STABLE, not IMMUTABLE (regconfig OIDs
-- aren't guaranteed stable across dump/restore), so Postgres rejects it
-- directly inside a generated column. This wrapper pins the 'english'
-- config and is safe to mark immutable since we never change it at runtime.
-- Must be plpgsql, not sql: a single-SELECT `language sql` function gets
-- inlined by the planner, which re-exposes the stable to_tsvector call and
-- defeats the immutable declaration; plpgsql functions are opaque to inlining.
create function public.immutable_english_tsvector(input text)
returns tsvector
language plpgsql
immutable
parallel safe
as $$
begin
  return to_tsvector('english', coalesce(input, ''));
end;
$$;

-- array_to_string is STABLE; wrap it in plpgsql (opaque to inlining) so
-- generated columns can call it safely.
create function public.immutable_text_array_join(arr text[], sep text)
returns text
language plpgsql
immutable
parallel safe
as $$
begin
  return coalesce(array_to_string(arr, sep), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth.users row is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- knowledge_assets
-- ---------------------------------------------------------------------------

create table public.knowledge_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('url', 'text', 'pdf', 'image')),
  source text not null default 'web_pwa'
    check (source in ('web_pwa', 'chrome_extension', 'ios_share', 'android_share', 'api')),
  status text not null default 'ready'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  title text,
  raw_content text,
  url text,
  storage_path text,
  mime_type text,
  content_hash text,
  summary text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    public.immutable_english_tsvector(
      coalesce(title, '') || ' ' ||
      coalesce(raw_content, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      public.immutable_text_array_join(tags, ' ')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- NOTE (Phase 2): a `vector(1536) embedding` column + ivfflat/HNSW index will
-- be added via a follow-up migration once AI metadata extraction exists to
-- populate it. See MEMORY.md > Architecture Decisions.

create index knowledge_assets_search_vector_idx
  on public.knowledge_assets using gin (search_vector);

create index knowledge_assets_user_created_idx
  on public.knowledge_assets (user_id, created_at desc);

create index knowledge_assets_user_status_idx
  on public.knowledge_assets (user_id, status);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger knowledge_assets_set_updated_at
  before update on public.knowledge_assets
  for each row execute procedure public.set_updated_at();

alter table public.knowledge_assets enable row level security;

create policy "Users can select own knowledge assets"
  on public.knowledge_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own knowledge assets"
  on public.knowledge_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own knowledge assets"
  on public.knowledge_assets for update
  using (auth.uid() = user_id);

create policy "Users can delete own knowledge assets"
  on public.knowledge_assets for delete
  using (auth.uid() = user_id);

-- Full-text search RPC, scoped to the calling user.
create function public.search_knowledge_assets(query text, result_limit int default 20)
returns setof public.knowledge_assets
language sql
security invoker
stable
as $$
  select *
  from public.knowledge_assets
  where user_id = auth.uid()
    and deleted_at is null
    and search_vector @@ websearch_to_tsquery('english', query)
  order by ts_rank(search_vector, websearch_to_tsquery('english', query)) desc
  limit result_limit;
$$;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('knowledge-assets', 'knowledge-assets', false);

create policy "Users can read own knowledge asset files"
  on storage.objects for select
  using (bucket_id = 'knowledge-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own knowledge asset files"
  on storage.objects for insert
  with check (bucket_id = 'knowledge-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own knowledge asset files"
  on storage.objects for delete
  using (bucket_id = 'knowledge-assets' and (storage.foldername(name))[1] = auth.uid()::text);
