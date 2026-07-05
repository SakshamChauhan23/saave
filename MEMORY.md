# MEMORY.md

This is the living project journal for Saave. Any AI coding tool working in this repo must read this file before starting work and update it after any change. See `AGENTS.md` for the exact protocol.

## Overview

Saave is a universal knowledge inbox: capture content from any platform (Instagram, LinkedIn, X, ChatGPT, Claude, Gmail, newsletters, PDFs, browser) into one place, then turn it into a personalized learning experience. Principles: capture first, mobile first, one inbox, zero organization, AI assists never interrupts. See `docs/00-Product-Vision.md` and `docs/01-PRD.md`.

**Phase 1 web MVP status (2026-07-05):** Functionally complete, verified in local dev, and deployed to production at **https://saave-kappa.vercel.app**. Production magic link uses Supabase's default email template (PKCE `/callback` flow) rather than the local custom token_hash template — see Decision Log.

## Phase 1 — What Is Built

### Authentication (EPIC-007)
- **Magic link (working locally):** Custom email template → `GET /auth/confirm?token_hash=…&type=magiclink` → server `verifyOtp` → session cookies → redirect to `/inbox`. No PKCE verifier cookie required (works from any browser/email client).
- **Google OAuth (UI ready):** Login button calls `signInWithOAuth`; callback at `GET /callback` does server-side `exchangeCodeForSession`. Requires Google OAuth creds in `supabase/.env` for local testing.
- **Sign out:** `POST /auth/signout`
- **Session clear (redirect-loop recovery):** `GET /auth/clear`
- **Implicit-flow fallback:** `/auth/complete` client page + `AuthHashHandler` in root layout for `#access_token` hash redirects.
- **Auth guards:** `getSessionUser()` in `/`, `/inbox`, and all API handlers does all redirect/401 logic. `apps/web/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) runs alongside it but is redirect-free — it only refreshes Supabase session cookies on every request (needed because Server Components can't write cookies themselves); a prior version that also redirected caused the Next.js 16 loop, so redirect logic was deliberately kept out of it.
- **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (`http://127.0.0.1:3000` locally).

### API (versioned `/api/v1/*`)
All routes require authenticated session (cookie-based Supabase client). Zod validation at boundaries via `@saave/shared-types`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/capture` | Capture URL or text (JSON) or PDF/image (multipart, max 50MB, Supabase Storage upload) |
| `GET` | `/api/v1/assets` | Chronological list, keyset cursor pagination |
| `GET` | `/api/v1/search` | Full-text search (`q`, `limit`, cursor) |

Shared behavior: SHA-256 content-hash dedup (409 if duplicate), RLS via user-scoped client (no service role), Postgres timestamptz normalized to ISO UTC in `mapAssetRow`.

### Inbox UI (EPIC-001, EPIC-002, EPIC-006)
- **`/inbox`:** `InboxApp` client component — quick capture (URL / text / file), asset cards, debounced search, load-more.
- **`/`:** Redirects to `/inbox` if session exists, else `/login`.
- **`/login`:** Magic link form + Google button; surfaces callback errors via `?message=`.
- Consumes `@saave/api-client` with same-origin cookie auth.

### Database & storage (Supabase)
- Migration: `supabase/migrations/20260705001030_init.sql`
- Tables: `profiles`, `knowledge_assets` (RLS, FTS `search_vector`, soft delete)
- RPC: `search_knowledge_assets`
- Storage bucket: `knowledge-assets` (`{user_id}/{asset_id}/{filename}`)
- Local email: Mailpit at `http://127.0.0.1:54324`

### Shared packages
- **`packages/shared-types`:** Zod schemas — `KnowledgeAsset`, `CaptureRequest`, `CaptureResponse`, `SearchQuery`, `SearchResult`, `ApiError`
- **`packages/api-client`:** Fetch wrappers for `/api/v1/capture`, `/api/v1/assets`, `/api/v1/search`

### Monorepo & tooling
- pnpm workspaces (`apps/web`, `packages/*`)
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`
- Next.js 16.2.10 dev binds to `127.0.0.1`; `allowedDevOrigins: ["127.0.0.1"]` in `next.config.ts`

## Phase 2 — AI Metadata Extraction (BYOK), What Is Built

**Status (2026-07-05): deployed to production** (https://saave-kappa.vercel.app). No-key and invalid-key paths confirmed working end-to-end for all three providers, locally and (via the settings UI) in production. The success path with a real, working provider key is implemented and code-reviewed but not yet run against a real account — see Open Questions.

**Architecture, in one paragraph:** each user brings their own Anthropic, OpenAI, or Mistral API key via `/settings` (EPIC-008, built here rather than later — see Decision Log). The key is encrypted at rest via Supabase Vault and never leaves the server after being saved. Capture is completely unaffected either way — it still returns instantly. After the HTTP response is sent, Next.js's `after()` triggers `extractMetadata()` in the background: if the user has no key, it does nothing; if they do, it calls their provider to generate title/summary/tags (and, for OpenAI only, an embedding), then writes the result back onto the same row. Any failure (bad key, provider error, parse error) is caught and recorded on the row rather than surfaced to the user — the asset is always fully usable with or without successful AI enrichment, matching the "AI assists, never interrupts" product principle.

### Data model additions (`supabase/migrations/20260705110109_phase2_ai_metadata.sql`)
- `knowledge_assets.embedding vector(1536)` + HNSW index (`vector_cosine_ops`) — populated only when the user's provider is OpenAI.
- `ai_provider_keys` table: `user_id` (PK), `provider` (`anthropic`|`openai`|`mistral`), `secret_id` (pointer into `vault.secrets` — the table itself never stores key material). RLS: SELECT-only policy for the owning user; there is deliberately no insert/update/delete policy — all writes go through the security-definer RPCs below, so a client can never point `secret_id` at a vault secret it doesn't own.
- `set_ai_provider_key(provider, api_key)` / `delete_ai_provider_key()`: security-definer RPCs, callable by `authenticated`, that create/update/delete the Vault secret and the `ai_provider_keys` row, scoped internally to `auth.uid()`.
- `get_ai_provider_key(user_id)`: security-definer RPC that joins `ai_provider_keys` to `vault.decrypted_secrets` and returns the decrypted key. Grant is `service_role` **only** (explicitly revoked from `anon`/`authenticated`) — decrypting a Vault secret inherently requires elevated privilege (only `postgres`/`service_role` can read `vault.decrypted_secrets` at all), and the revoke/grant is what actually enforces that only the trusted background job can call it; RLS alone doesn't restrict function calls the way it restricts table reads.

### API (`/api/v1/settings/ai-key`)
- `GET` → `{ configured: boolean, provider: 'anthropic'|'openai'|'mistral'|null }` — never returns key material.
- `POST { provider, api_key }` → calls `set_ai_provider_key` via the user's own RLS-scoped client (not service-role).
- `DELETE` → calls `delete_ai_provider_key`.

### Extraction pipeline
- `apps/web/lib/ai/prompt.ts`: shared prompt + defensive JSON-response parsing (regex-extracts the first `{...}` block, validates field types, clamps lengths).
- `apps/web/lib/ai/anthropic.ts`: `claude-haiku-4-5-20251001` for title/summary/tags. No embeddings (Anthropic has no embeddings API).
- `apps/web/lib/ai/openai.ts`: `gpt-4o-mini` for title/summary/tags, `text-embedding-3-small` (1536-dim, matches the column) for embeddings.
- `apps/web/lib/ai/mistral.ts`: `mistral-small-latest` for title/summary/tags. Mistral does have an embeddings endpoint (`mistral-embed`), but it's 1024-dim vs. the column's fixed 1536 — not used, same tier as Anthropic (verified via curl: an invalid Mistral key correctly produces a real Mistral 401, proving the dispatch routes to Mistral specifically, not silently falling through to OpenAI).
- `apps/web/lib/ai/extract.ts`'s provider dispatch is an explicit `switch` over all three providers (not a two-way ternary) — a ternary would have silently misrouted Mistral to whichever branch was the "else".
- `apps/web/lib/ai/extract.ts`: orchestrator. Uses `lib/supabase/service.ts` (service-role client — the **only** place in the codebase that uses service-role, and only because decrypting a Vault secret requires it). Calls `get_ai_provider_key`; if no row, returns immediately (no write). Otherwise calls the provider, then merges `{ title?, summary, tags, embedding, metadata.ai: {status, provider, error?} }` onto the existing row (preserving any existing `metadata` fields like the URL-capture `excerpt`). Both the `select` and `update` inside the merge check and log their own errors — an earlier version silently swallowed a permission error here (see Decision Log bug below), which is what a "no-op" extraction looks like if you don't check.
- Wired into `apps/web/app/api/v1/capture/route.ts` via `after(() => extractMetadata(...))` for `text`/`url` captures only (PDF/image deferred — no extraction-worthy text without OCR/PDF-parsing, out of scope for this pass).
- `apps/web/lib/api/url-metadata.ts` extended: `fetchUrlTitle` → `fetchUrlMetadata`, now also returning an `excerpt` (og:description/meta description, falling back to the first ~1000 chars of body text) stored in `metadata.excerpt` — a title alone wasn't enough content for a meaningful AI summary of a URL capture.

### Settings UI (EPIC-008, minimal)
- `/settings` page (`app/settings/page.tsx` + `settings-app.tsx`): pick a provider, paste a key (password input, never redisplayed), see "configured: provider X" status, remove key. Linked from the `/inbox` header.

## Not built yet (updated)
- PDF/image AI extraction (needs OCR/PDF-text-extraction — deferred, see Phase 1 plan)
- Phase 3: Chrome extension (`apps/extension` placeholder only)
- Phase 4: iOS/Android share targets
- PWA manifest / service worker

## Architecture Decisions

- Monorepo (pnpm workspaces) with `apps/*` (web, extension, ios, android) and `packages/*` (shared-types, api-client), so the future Chrome extension and native apps can share a contract without restructuring later.
- Frontend: Next.js (TypeScript, App Router) as a PWA. Backend: Next.js Route Handlers under `apps/web/app/api/v1/*` for Phase 1 (not separate Supabase Edge Functions) — single deployable, fastest iteration.
- Data/auth/storage: Supabase (Postgres, Auth, Storage).
- **Revised from the original Phase 1 plan**: Phase 2 AI extraction runs as a Next.js `after()` background callback in the same deployable, not a Supabase Edge Function triggered by a Database Webhook. Reason: avoids hardcoding environment-specific webhook URLs/secrets in version-controlled migrations for what's a fairly modest per-capture task; same pattern already used for URL-title fetching. Revisit if extraction ever needs to scale independently of the web app.
- Phase 2 AI is **BYOK (bring your own key)**, not a shared app-wide key — each user supplies their own Anthropic/OpenAI/Mistral API key via `/settings`, encrypted at rest via Supabase Vault. Chosen specifically so AI usage cost is borne by the user who benefits from it, not the app owner, and so the product works with any of the three providers, or with no key at all (capture/search always work regardless).
- Only an OpenAI key yields an embedding. Anthropic has no embeddings endpoint at all; Mistral does (`mistral-embed`), but it outputs 1024-dim vectors against a `knowledge_assets.embedding` column fixed at `vector(1536)` (chosen to match OpenAI's `text-embedding-3-small`) — and embeddings from different models aren't comparable in the same vector space regardless of dimension. Anthropic and Mistral both still get full title/summary/tags. This is a provider-capability/schema constraint, not a product choice.
- Auth Phase 1 scope: email magic-link + Google OAuth only. Sign in with Apple deferred to Phase 4 (bundled with the paid Apple Developer account setup the iOS Share Extension already requires).
- Magic link uses **server `token_hash` + `verifyOtp`** (Supabase SSR pattern), not client PKCE code exchange — avoids verifier-cookie failures when opening email in a different context.
- Search Phase 1: Postgres full-text search (tsvector/GIN). Semantic/embedding search added in Phase 2 once AI metadata extraction exists to generate embeddings from.
- No normalized tags table — tags are AI-suggested/free-form (`text[]` column), consistent with the "zero organization" principle.
- API versioned from the first route (`/api/v1/*`) since Phase 3 (Chrome extension) and Phase 4 (iOS/Android) will consume it directly.
- **`apps/web/proxy.ts` is redirect-free** — Next.js 16.2.10 renamed `middleware.ts` to `proxy.ts`; an earlier version also did auth redirects there and caused self-redirect loops, so all redirect/401 logic stays in `getSessionUser()` per page/route handler. `proxy.ts` only refreshes session cookies.

## Tech Stack

- Next.js 16.2.10 (TypeScript, App Router, Tailwind 4, ESLint) — `apps/web`
- Supabase: Postgres 17, Auth, Storage, Edge Functions (Phase 2+)
- pnpm workspaces (monorepo package manager)
- Zod 4 (API/schema validation), `@supabase/ssr` + `@supabase/supabase-js` (auth/session)
- cheerio (URL title/excerpt fetch on capture)
- pgvector (`vector` extension) + Supabase Vault (`supabase_vault` extension) — Phase 2 embeddings + encrypted BYOK API keys
- Anthropic (`claude-haiku-4-5-20251001`), OpenAI (`gpt-4o-mini`, `text-embedding-3-small`), and Mistral (`mistral-small-latest`) called directly via `fetch`, no SDK — Phase 2 extraction, per-user key
- Hosting: Vercel (web app, project `saave` under `saksham-chauhans-projects`, GitHub-connected to [SakshamChauhan23/saave](https://github.com/SakshamChauhan23/saave), root directory `apps/web`), Supabase hosted project `fxlyuykucnydxqtapbgf` (org `jfahklmldaqobvjwiktk`, region `ap-south-1`)
- Production URL: **https://saave-kappa.vercel.app**

## Repo Structure

```
Saave/
├── MEMORY.md / AGENTS.md / CLAUDE.md
├── README.md
├── package.json / pnpm-workspace.yaml / pnpm-lock.yaml
├── docs/                  # product vision, PRD, epics
├── apps/
│   └── web/               # Next.js PWA — Phase 1 complete locally
│       ├── app/
│       │   ├── page.tsx              # / → /inbox or /login (+ auth code forward)
│       │   ├── layout.tsx            # root layout + AuthHashHandler
│       │   ├── auth-hash-handler.tsx
│       │   ├── (auth)/
│       │   │   ├── login/            # magic link + Google UI
│       │   │   └── callback/route.ts # OAuth PKCE ?code= exchange (server)
│       │   ├── auth/
│       │   │   ├── confirm/route.ts  # magic-link token_hash verify (server)
│       │   │   ├── complete/page.tsx # implicit #access_token fallback
│       │   │   ├── clear/route.ts    # wipe stale session cookies
│       │   │   └── signout/route.ts
│       │   ├── inbox/
│       │   │   ├── page.tsx          # auth guard + InboxApp
│       │   │   ├── inbox-app.tsx     # capture, list, search UI
│       │   │   └── asset-card.tsx
│       │   └── api/v1/
│       │       ├── capture/route.ts
│       │       ├── assets/route.ts
│       │       └── search/route.ts
│       ├── lib/
│       │   ├── api/                  # hash, pagination, assets, url-metadata, response, client
│       │   ├── auth/                 # site-url, forward-auth-code
│       │   └── supabase/             # browser + server clients, getSessionUser()
│       ├── proxy.ts                  # redirect-free cookie refresh (Next 16 "middleware" rename)
│       ├── next.config.ts            # allowedDevOrigins for 127.0.0.1
│       ├── .env.example
│       └── README.md                 # local dev instructions
├── packages/
│   ├── shared-types/       # Zod schemas + TS types
│   └── api-client/         # fetch wrappers over /api/v1/*
└── supabase/
    ├── config.toml         # site_url, redirect URLs, magic_link template
    ├── templates/magic_link.html
    ├── .env.example        # Google OAuth creds (optional)
    ├── migrations/20260705001030_init.sql          # Phase 1
    └── migrations/20260705110109_phase2_ai_metadata.sql  # Phase 2
```

`apps/web` additions for Phase 2: `app/settings/` (page + `settings-app.tsx`), `app/api/v1/settings/ai-key/route.ts`, `lib/ai/` (`prompt.ts`, `anthropic.ts`, `openai.ts`, `extract.ts`), `lib/supabase/service.ts`.

## Data Model

Phase 1 — [supabase/migrations/20260705001030_init.sql](supabase/migrations/20260705001030_init.sql):
- `public.profiles`: id (FK auth.users), email, display_name, avatar_url, created_at, updated_at. Auto-created on signup via trigger.
- `public.knowledge_assets`: id, user_id, type (url/text/pdf/image), source (web_pwa/chrome_extension/ios_share/android_share/api), status (pending/processing/ready/failed), title, raw_content, url, storage_path, mime_type, content_hash, summary, tags (text[]), metadata (jsonb), search_vector (generated tsvector), created_at, updated_at, deleted_at. RLS: `auth.uid() = user_id`.
- `search_knowledge_assets(query, result_limit)` RPC for user-scoped FTS.
- Storage bucket `knowledge-assets`, path `{user_id}/…`, private + RLS on `storage.objects`.

Phase 2 — [supabase/migrations/20260705110109_phase2_ai_metadata.sql](supabase/migrations/20260705110109_phase2_ai_metadata.sql):
- `knowledge_assets.embedding vector(1536)` + HNSW index.
- `public.ai_provider_keys`: user_id (PK, FK auth.users), provider (anthropic/openai/mistral), secret_id (FK-like pointer into `vault.secrets`, not enforced as an actual FK since `vault` isn't in scope for cross-schema FKs), created_at, updated_at. RLS: SELECT-only for owner, no direct insert/update/delete policy.
- RPCs: `set_ai_provider_key(provider, api_key)`, `delete_ai_provider_key()` (both `authenticated`), `get_ai_provider_key(user_id)` (`service_role` only).
- Explicit grants added for `knowledge_assets`/`profiles`/`ai_provider_keys` to `authenticated` and `service_role` — see Decision Log for why these turned out to be necessary.

## Epic Status Table

| Epic | Phase | Status | Notes | Last Updated |
|---|---|---|---|---|
| EPIC-001 Universal Inbox | 1 | **Done** | Chronological list + load more via `@saave/api-client` | 2026-07-05 |
| EPIC-002 Universal Capture | 1 | **Done** | URL/text/pdf/image capture; dedup by content hash; PDF/image verified end-to-end via curl | 2026-07-05 |
| EPIC-006 Search | 1 | **Done** | Debounced FTS search bar on inbox; verified match + empty-state via curl | 2026-07-05 |
| EPIC-007 Authentication | 1 | **Done** | Verified E2E locally and in production. Prod magic link (default-template PKCE flow) confirmed working by user; Google OAuth live (dashboard-configured), authorize redirect verified, full consent flow not yet user-tested | 2026-07-05 |
| EPIC-009 AI Metadata Extraction | 2 | **Done** | BYOK Anthropic/OpenAI/Mistral extraction via `after()`. Deployed to production; real-key success path confirmed live (Mistral) — title/summary/tags generated correctly end-to-end | 2026-07-05 |
| EPIC-008 Settings | 2 | **Done (minimal)** | `/settings`: BYOK AI provider key management only (save/status/remove). No account/profile settings yet | 2026-07-05 |
| EPIC-005 Chrome Extension | 3 | Not Started | | 2026-07-05 |
| EPIC-003 iOS Share Extension | 4 | Not Started | Apple Sign-In bundled here | 2026-07-05 |
| EPIC-004 Android Share Target | 4 | Not Started | | 2026-07-05 |

## Local Development

```bash
# From repo root
supabase start                                    # applies migrations; note anon key
cp apps/web/.env.example apps/web/.env.local      # set NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev                                          # http://127.0.0.1:3000
```

- **Always use `127.0.0.1:3000`** in the browser (not `localhost`) — dev server and auth cookies are pinned to that host.
- **Magic link emails:** Mailpit at `http://127.0.0.1:54324`
- **Redirect loop fix:** visit `http://127.0.0.1:3000/auth/clear` then `/login`
- **After changing `supabase/templates/magic_link.html` or `config.toml`:** `supabase stop && supabase start`
- **Google OAuth (optional):** creds in `supabase/.env` per `supabase/.env.example`

## Decision Log

### 2026-07-05 — Stack chosen: Next.js + Supabase
Considered a custom Node/Postgres backend as an alternative (more control, more infra to maintain). Chose Next.js + Supabase for speed: one vendor for auth/db/storage, fastest path to a working MVP.

### 2026-07-05 — Build order: MVP-first, web-only Phase 1
Considered building all surfaces (web, Chrome, iOS, Android) in parallel. Chose MVP-first — backend + auth + capture + inbox + search on web only — to reach a usable product fastest and defer native mobile work (which needs Xcode/Android Studio) to last.

### 2026-07-05 — Monorepo from day one
Single Next.js app would need a painful restructure once the Chrome extension and native apps need to share types/API contract. Chose pnpm workspaces (`apps/*`, `packages/*`) over Turborepo for now — Turborepo's caching value shows up once there are multiple real build targets with real build times; revisit at Phase 3.

### 2026-07-05 — Backend as Next.js Route Handlers, not Edge Functions, for Phase 1
Single deployable, fastest iteration. Edge Functions introduced in Phase 2 specifically for the event-driven AI metadata extraction worker, where independent async processing actually earns its complexity.

### 2026-07-05 — Full-text search before embeddings
Postgres FTS (tsvector/GIN) needs no extra infra and serves "find that thing I saved" well. Embeddings deferred to Phase 2 since generating them before the AI metadata pipeline exists would mean paying LLM cost with nothing else consuming it yet.

### 2026-07-05 — No normalized tags table
Tags are AI-suggested/free-form, consistent with the "zero organization" product principle. A join table would be premature normalization until a real tag-management UI exists (candidate: EPIC-008 Settings).

### 2026-07-05 — Auth scope: email + Google for Phase 1, Apple deferred to Phase 4
Sign in with Apple requires a paid Apple Developer account and extra web configuration. User confirmed no such account exists yet, and Phase 4 (iOS Share Extension) already requires setting one up — so Apple Sign-In is bundled there instead of adding an early blocker to Phase 1.

### 2026-07-05 — Cross-tool memory system: MEMORY.md + AGENTS.md/CLAUDE.md convention
User works across multiple AI coding tools (Claude Code, potentially Grok, others) and wants continuity that isn't tied to any one tool's private memory/hooks. Chose a plain-markdown convention: `MEMORY.md` as the append/overwrite journal, `AGENTS.md` as the canonical tool-agnostic instruction file, `CLAUDE.md` duplicating the protocol verbatim (not just an import) so it works even if a tool doesn't honor `@`-imports.

### 2026-07-05 — Fix ERR_TOO_MANY_REDIRECTS: remove middleware entirely
Next.js 16.2.10 + `middleware.ts` caused every route to 307-redirect to itself (broken Proxy layer), plus stale Supabase cookies worsened loops. **Deleted `middleware.ts`.** Auth is page-level only (`/` and `/inbox` use `getSessionUser()` + `redirect()`). Added `GET /auth/clear` to wipe stale sessions. Dev binds to `127.0.0.1`.

### 2026-07-05 — Phase 1 inbox UI wired to API
Replaced `/inbox` stub with `InboxApp` client component using `@saave/api-client`: quick capture (URL/text/PDF/image), chronological asset cards, debounced search, load-more pagination. Home `/` redirects to `/inbox` or `/login`.

### 2026-07-05 — Phase 1 API routes implemented
Added `POST /api/v1/capture` (JSON url/text + multipart pdf/image with storage upload, SHA-256 dedup), `GET /api/v1/assets` (keyset cursor pagination), `GET /api/v1/search` (FTS via `textSearch` + offset cursor). Shared helpers in `apps/web/lib/api/*`. All routes use `getSessionUser()` + Zod validation; RLS via user-scoped Supabase client (no service role).

### 2026-07-05 — Auth callback: client-side PKCE exchange + canonical host (superseded)
Server route handler at `/callback` could not read the browser-stored PKCE code verifier (`validation_failed: both auth code and code verifier should be non-empty`). Briefly replaced with a client `callback/page.tsx`. **Superseded** by server `token_hash` magic-link flow (`/auth/confirm`) and server `/callback` route for OAuth only — see entries below.

### 2026-07-05 — Next.js allowedDevOrigins for 127.0.0.1 local dev
Loading the dev app at `http://127.0.0.1:3000` while the server binds to `localhost` blocked client JS (Next.js 16 cross-origin dev safety), so login buttons did nothing (native `GET /login?` form submit). Added `allowedDevOrigins: ["127.0.0.1"]` to `next.config.ts`.

### 2026-07-05 — MEMORY.md reconciled with repo + Phase 1 auth completed
Prior MEMORY.md was stale (claimed packages/schema not created; all epics Not Started). Reconciled against actual code. Completed EPIC-007: login (magic link + Google), callback code exchange, sign-out route, `getSessionUser()` helper, `/inbox` authenticated page, `.env.example` files, Supabase redirect URL + Google OAuth config. Fixed migration generated-column immutability (`immutable_text_array_join` wrapper for `tags` in FTS).

### 2026-07-05 — Fix magic-link “Sign-in could not be completed” (code dropped on /)
Local GoTrue emails embed `redirect_to=http://127.0.0.1:3000` (site origin), so after verify users landed on `/?code=…` and the server `page.tsx` redirected to `/login` before the PKCE code could be exchanged. **Fix:** `forwardAuthCodeIfPresent()` on `/` and `/login` forwards `?code=` to `/callback`; pinned redirects via `NEXT_PUBLIC_SITE_URL`.

### 2026-07-05 — Magic link: server token_hash flow (no PKCE verifier cookie)
Client `exchangeCodeForSession` failed with “PKCE code verifier not found in storage” because magic-link PKCE depends on a browser cookie that email clients / new tabs often lack. **Fix:** custom `supabase/templates/magic_link.html` links to `GET /auth/confirm?token_hash=…&type=magiclink`; server route calls `verifyOtp` and sets session cookies. OAuth still uses `GET /callback` server route for `?code=` exchange. Implicit hash fallback: `/auth/complete` client page.

### 2026-07-05 — Phase 1 auth → inbox verified locally
User confirmed magic-link sign-in lands on `/inbox` successfully after token_hash flow fix.

### 2026-07-05 — Fix capture/list 500: Postgres timestamptz vs Zod iso.datetime
Supabase returns `created_at`/`updated_at` as `+00:00` offsets (often with microsecond precision). `KnowledgeAsset` uses `z.iso.datetime()` which requires UTC `Z` format — `mapAssetRow` threw ZodError → API 500. **Fix:** normalize timestamps via `Date#toISOString()` in `lib/api/assets.ts` before parsing.

### 2026-07-05 — Phase 1 web MVP verified locally (auth + capture + inbox)
User confirmed magic-link auth, inbox load, and capture all working after timestamp fix. Phase 1 web loop is functionally complete in local dev.

### 2026-07-05 — MEMORY.md full reconciliation
User requested comprehensive MEMORY.md update. Added Phase 1 delivery summary, API table, auth flow docs, local dev section, corrected repo structure (removed stale “stub” references), marked superseded auth callback approach in decision log.

### 2026-07-05 — Code review found 3 issues; all fixed and verified
A review of Grok's build (migration confirmed applied against real `supabase/postgres:17.4.1.072`, lint/typecheck clean) surfaced three issues, all fixed:
1. **Reintroduced `proxy.ts` (redirect-free) for cookie refresh.** The prior "no middleware" decision removed session-cookie refresh entirely, not just the redirect logic that caused the loop. Without it, a token refresh triggered inside a Server Component render (e.g. `/inbox`, `/`) can't write the rotated refresh-token cookie back to the browser (Server Components can't set cookies) — since `enable_refresh_token_rotation = true`, this could eventually force an unexpected logout on long-lived sessions that mostly hit page loads rather than API routes. Fix: added back a middleware-equivalent file whose *only* job is `await supabase.auth.getUser()` to trigger/persist the refresh — it returns no redirects, so it can't reproduce the original loop. Verified via curl: `/`, `/inbox`, `/login`, `/api/v1/assets`, `/callback`, `/auth/confirm` all still resolve in a single hop, no loops.
2. **Renamed `middleware.ts` → `proxy.ts`.** Next.js 16.2.10 deprecated the `middleware` file convention in favor of `proxy` (same file, exported function renamed `middleware` → `proxy`); confirmed via the bundled docs (`node_modules/next/dist/docs/.../proxy.md`) and the dev server's own deprecation warning, which disappeared after the rename.
3. **Fixed dead/wrong branch in `lib/auth/forward-auth-code.ts`.** It was forwarding `token_hash`+`type` params to `/callback`, which only reads `code` (OAuth) — would have failed with "No authorization code received" if ever hit. Now forwards to `/auth/confirm`, which actually handles `token_hash`. Not exercised by the tested happy path (the magic-link email points straight at `/auth/confirm`), but was a real landmine.
4. **Validated cursor shape in `lib/api/pagination.ts`.** `decodeAssetCursor` previously only checked for a `|` separator before its output was interpolated directly into a raw PostgREST `.or()` filter string in `/api/v1/assets`. Added strict ISO-datetime and UUID regex checks so a malformed/crafted cursor is rejected (400) instead of reaching the filter string unchecked. RLS already bounded the blast radius to the caller's own rows, but this closes the gap properly rather than relying on that alone.

All four verified together: lint clean, typecheck clean (after clearing a stale `.next` cache that was producing an unrelated false-positive), dev server restarted cleanly, and the full redirect/auth-gate matrix re-tested with curl.

### 2026-07-05 — PDF/image capture and search verified end-to-end
Closed the last open Phase 1 verification gap. Using a fresh test user (magic link via Mailpit → `/auth/confirm` → session cookies), confirmed via curl against `/api/v1/capture` and `/api/v1/search`:
- PDF and image multipart uploads both return 201, land in Supabase Storage at the expected `{user_id}/{asset_id}/{filename}` path with correct size/mimetype (checked directly via `storage.objects`).
- Content-hash dedup correctly returns 409 with `existing_asset_id` on re-upload of identical bytes — and correctly keys on content hash alone (re-uploading the same bytes under a *different* claimed `type` still 409s against the original asset, since dedup isn't type-scoped).
- MIME validation (`"PDF uploads must use application/pdf"` / image prefix check) correctly rejects a mismatched declared type when tested with genuinely new bytes (the first attempt at this test was a false pass — it collided with dedup instead, since it reused already-uploaded PNG bytes).
- Missing file field returns 400.
- FTS search matches a text capture's content (`q=roadmap`), returns empty (not an error) for a nonsense query, and correctly does *not* match filenames like "test.pdf"/"test2.png" against unrelated terms — Postgres's default text-search parser tokenizes dotted filenames as a single `file`-type lexeme rather than splitting on the dot, so this is expected parser behavior, not a bug.
- `/api/v1/assets` lists all captured items (text/pdf/image) in correct reverse-chronological order.

### 2026-07-05 — Phase 1 deployed to production (Vercel + hosted Supabase)
Created hosted Supabase project `fxlyuykucnydxqtapbgf` (org `jfahklmldaqobvjwiktk`, region `ap-south-1`, matching the user's other projects) via CLI, pushed the migration (`supabase db push`, confirmed via `supabase migration list --linked`). Created a public GitHub repo ([SakshamChauhan23/saave](https://github.com/SakshamChauhan23/saave)) and pushed the code. Created Vercel project `saave`, connected it to the GitHub repo, and set its Root Directory to `apps/web` via the Management API (`PATCH /v9/projects/{id}`) — necessary because deploying via CLI directly from `apps/web` uploads only that subtree and misses the root `pnpm-lock.yaml`/`pnpm-workspace.yaml`, causing Vercel to fall back to `npm install` and fail; deploying from the repo root with Root Directory set gives Vercel the full monorepo context it needs to detect and use pnpm correctly. Set `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SITE_URL` as production env vars and redeployed (required since `NEXT_PUBLIC_*` vars are inlined at build time). Production: **https://saave-kappa.vercel.app**.

Verified via curl against the live deployment: `/`, `/login`, `/inbox`, `/api/v1/assets` all resolve correctly (redirects/401s, no loops) — same matrix as the local `proxy.ts` fix verification.

### 2026-07-05 — Production magic link uses Supabase's default template, not the local custom one
Attempting `supabase config push` to set the hosted project's `site_url`/`additional_redirect_urls` failed: "Email template modification is not available for free tier projects using the default email provider." Three options: (a) accept the default template + existing PKCE `/callback` route, (b) set up custom SMTP, (c) upgrade the Supabase plan. User chose (a) — no new signups or cost, ships now. To push anyway, temporarily neutralized the email-template and Google-auth sections of `config.toml` (matching what was already live), pushed, then restored the local-dev values. `site_url` and 2 of the `additional_redirect_urls` entries in `supabase/config.toml` now use env()-substitution — `env(SITE_URL)`, `env(PROD_REDIRECT_CALLBACK)`, `env(PROD_REDIRECT_CONFIRM)` — with local-dev defaults in the gitignored `supabase/.env`, so future `supabase config push` runs can target production (by passing prod values inline) without touching local dev. Consequence: production magic-link sign-in goes through GoTrue's default confirmation → our existing `/callback` route (`?code=` → `exchangeCodeForSession`), the same PKCE path already used for Google OAuth — not the token_hash `/auth/confirm` path used locally. This reintroduces the original risk the token_hash flow was built to avoid (PKCE code verifier missing if the email link is opened in a different browser context than the one that requested it). Also disabled Google OAuth on the hosted project for now (`external.google.enabled = false`, confirmed via `GET /auth/v1/settings`) since no real production Google OAuth credentials exist yet — local `supabase/config.toml` still has it enabled for local testing once credentials are added.

### 2026-07-05 — Google OAuth enabled in production via Supabase dashboard directly
User configured the Google provider (client_id/secret) directly in the hosted Supabase project's Auth dashboard, bypassing `config.toml`/`supabase config push` entirely. Verified live via two read-only checks: `GET /auth/v1/settings` now reports `external.google: true`, and `GET /auth/v1/authorize?provider=google&redirect_to=.../callback` correctly 302s to `accounts.google.com` with a real `client_id` and the right `redirect_uri` (`https://fxlyuykucnydxqtapbgf.supabase.co/auth/v1/callback`) — confirms the provider is genuinely wired, not just toggled on with empty credentials.

**Important guardrail**: local `supabase/config.toml` still has `[auth.external.google]` with `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, which resolves to empty in any shell that hasn't set that var (true for this session and likely most). **Do not run `supabase config push` against the hosted project without first setting real `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET` env vars matching what's live** — an unguarded push would silently overwrite the dashboard-configured credentials with empty ones and break prod Google sign-in. Since the dashboard is now the source of truth for these two secrets, prefer leaving Google config changes to the dashboard going forward rather than reconciling through `config.toml`.

### 2026-07-05 — Production magic link confirmed working by user
User manually tested the real magic-link email flow at https://saave-kappa.vercel.app/login and confirmed sign-in succeeds. This exercises the default-template PKCE path (GoTrue confirmation → `/callback?code=...` → `exchangeCodeForSession`), the same-browser-context case. The cross-browser-context PKCE risk noted in the entry above (email link opened in a different browser than the one that requested it) remains untested and still open — that's a different, narrower failure mode than "does it work at all."

### 2026-07-05 — Phase 2 kickoff: BYOK, not a shared app key
User's explicit requirement before any implementation: AI provider keys must be **bring-your-own-key**, not a single app-wide key the developer pays for — "if they are using mine then it will charge extra." Also required graceful degradation when a user has no key (or uses a provider not yet supported): capture/search must keep working regardless, matching the existing "AI assists, never interrupts" principle. This drove the whole Phase 2 design: `ai_provider_keys` (Vault-encrypted, one row per user), `/settings` UI, and `extractMetadata()` returning silently (no error, no write) when no key is configured.

### 2026-07-05 — Phase 2 architecture revision: after() instead of Database Webhook + Edge Function
The original Phase 1 plan sketched Phase 2 as a Postgres Database Webhook calling a Supabase Edge Function. Revised at implementation time to a Next.js `after()` callback directly in `/api/v1/capture` instead. Reason: avoids hardcoding an environment-specific Edge Function URL + webhook shared-secret in version-controlled migrations for what's a modest per-capture task; the app already uses this "call an external thing from the route handler" pattern for URL-title fetching. Confirmed `after()` runs on both Node.js server and Vercel (via `waitUntil`) per the Next.js 16 docs before committing to this.

### 2026-07-05 — Embeddings: OpenAI only, Anthropic gets summary/tags only
Anthropic has no embeddings endpoint. Rather than requiring a second API key from Anthropic users just for embeddings, or blocking Anthropic entirely, Anthropic-key users get title/summary/tags (their capture stays FTS-searchable, same as before); only OpenAI-key users additionally get an embedding written to `knowledge_assets.embedding`. This is a provider-capability constraint, not a deliberate product limitation — revisit if a future provider (e.g. Voyage) is added specifically for embeddings alongside either LLM.

### 2026-07-05 — Bug found+fixed: missing table grants on a rebuilt local instance
While testing Phase 2 end-to-end, `/api/v1/settings/ai-key` and `/api/v1/assets` both started failing with "permission denied for table X" — on a database that had just been fully rebuilt (fresh Docker volumes, upgraded Supabase CLI 2.34.3→2.109.0). Root cause: this Postgres image's default ACL for schema `public` only auto-grants `delete/truncate/references/trigger` to `anon`/`authenticated`/`service_role` on tables created by the `postgres` role (our migrations run as `postgres`) — NOT `select/insert/update`, unlike tables created by `supabase_admin` (Supabase's own internal tables, which get full default access). The already-deployed **production** project was provisioned on an image where this wasn't the case (extensively verified working in earlier sessions), so this was a environment-specific latent gap in the Phase 1 migration that had never been hit before. Fixed with explicit `grant select, insert, update, delete on knowledge_assets to authenticated, service_role` (+ `profiles`, + `select` on `ai_provider_keys`) added to the Phase 2 migration. Caught a second, related bug in the process: `lib/ai/extract.ts`'s `mergeAndUpdate()` wasn't checking the `update()` call's error, so the extraction failure-path write was itself silently failing on the missing `service_role` grant — invisible until explicit error logging was added. Lesson: always check and log errors from Supabase client calls inside background jobs (`after()`), since there's no request left to surface them to.

### 2026-07-05 — Phase 2 verified locally: no-key and invalid-key paths
Using a fresh test user: (1) capture with no AI key configured → succeeds immediately, `metadata` untouched (no wasted write). (2) Set an invalid Anthropic key via `/api/v1/settings/ai-key` → capture still succeeds immediately; background job correctly reaches Anthropic (proving Vault encrypt/decrypt + the `get_ai_provider_key` RPC all work end-to-end), gets a real 401 from Anthropic, and writes `metadata.ai = {status:"failed", provider, error}` onto the row — asset title/content remain fully intact and usable. `/settings` page confirmed auth-gated (307 when signed out, 200 when signed in) and functional. Not yet tested: the actual success path with a real, working provider key (implemented and reviewed, but no real API key was available in this session to exercise it).

### 2026-07-05 — Added Mistral as a third BYOK provider
User requested Mistral support. Added `apps/web/lib/ai/mistral.ts` (`mistral-small-latest` for title/summary/tags), extended `AiProvider` to `'anthropic'|'openai'|'mistral'` in shared-types, and updated the `ai_provider_keys.provider` CHECK constraint + `set_ai_provider_key`'s validation (amended the not-yet-deployed-to-prod Phase 2 migration in place rather than adding a follow-up migration, since it hadn't shipped anywhere). Decision: Mistral does have its own embeddings model (`mistral-embed`), but it's 1024-dim against the `knowledge_assets.embedding` column's fixed 1536 (sized for OpenAI's `text-embedding-3-small`) — rather than a schema change to support a second embedding dimension, or storing embeddings from different models in a way that would make per-user semantic search inconsistent if they ever switched providers, Mistral joins Anthropic at the "title/summary/tags only" tier; OpenAI remains the sole embeddings source. Also changed `lib/ai/extract.ts`'s provider dispatch from a two-way ternary to an explicit `switch` over all three providers — the ternary would have silently misrouted Mistral's key to the OpenAI code path. Verified via curl: an invalid Mistral key produces a real `Mistral API error 401: {"detail":"Unauthorized"}` recorded in `metadata.ai`, confirming requests actually reach Mistral's API and aren't being misdispatched.

### 2026-07-05 — Phase 2 deployed to production; lesson on amending already-applied migrations
Deployed Phase 2 to production: `supabase db push` applied `20260705110109_phase2_ai_metadata.sql` (confirmed via `supabase migration list --linked` showing matching Local/Remote timestamps for both Phase 1 and Phase 2 migrations), added `SUPABASE_SERVICE_ROLE_KEY` to Vercel production env vars, redeployed. **Bug found**: production immediately rejected Mistral keys with "invalid provider: mistral" — because that migration had *already* been applied to production once (from an earlier attempt in this session that succeeded without it being obvious at the time), before the in-place edit that added Mistral to it. Supabase's migration tracking is by filename/timestamp already-recorded in `schema_migrations`, not by re-diffing file content — so `db push` correctly saw "up to date" and never reapplied the edited file. **Lesson, superseding the earlier "amend in place since it hasn't shipped" reasoning**: once a migration file has been applied *anywhere* (including possibly-unnoticed earlier attempts), always add a new migration instead of editing an old one, even if you believe it hasn't shipped — you can't always be certain of that. Fixed with a proper follow-up migration, `20260705131843_add_mistral_provider.sql` (drops/recreates the CHECK constraint, `create or replace`s `set_ai_provider_key`), verified locally via `db reset` before pushing to production.

### 2026-07-05 — Phase 2 success path confirmed in production with a real Mistral key
User configured a real Mistral key via `/settings` in production and captured a URL. The card initially showed no AI enrichment — not a bug, just checked before the `after()` background job had finished. On a later refresh, the same asset showed a correctly AI-refined title, a generated summary, and four relevant tags, all sourced from the actual Mistral API (not a mock). This is the last previously-unverified piece of Phase 2 — the full BYOK pipeline (Vault-encrypted key → background extraction → provider API call → row update) is now confirmed working end-to-end against a live account in production, not just via the invalid-key failure-path proxy tests from earlier. Phase 2 is fully done.

## Open Questions

- Production magic-link PKCE-across-browser-contexts risk (opening the link in a *different* browser than the one that requested it) is still untested — the common same-browser case is now confirmed working. Revisit if users report failed sign-ins, or when SMTP/paid-tier is set up to restore the token_hash flow.
- `auth.rate_limit.email_sent = 2`/hour and `max_frequency = "1s"` (very permissive resend interval) now apply to a public production auth endpoint — inherited from local-dev-friendly defaults, not deliberately chosen for prod. Worth hardening before real traffic.
- Long-lived-session refresh behavior (the `proxy.ts` cookie-refresh fix) hasn't been observed over a real ~1hr+ session yet — verified via route-shape testing (no loops, correct 401/307s), not via an actual expired-token replay.
- Google OAuth's actual consent screen → callback → session flow hasn't been completed by a real user yet (only the authorize redirect was verified) — needs an interactive browser test.

## Next Steps

1. Manually test the Google OAuth flow end-to-end against production (https://saave-kappa.vercel.app/login) — the one remaining unverified auth path.
2. Harden production auth rate limits before real traffic (see Open Questions).
3. PWA polish: web manifest, service worker, mobile-first layout pass.
4. Phase 3: Chrome extension consuming `/api/v1/*`.