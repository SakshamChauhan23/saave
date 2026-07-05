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

### Not built yet
- Phase 2: AI metadata extraction, summaries, tags, embeddings
- Phase 3: Chrome extension (`apps/extension` placeholder only)
- Phase 4: iOS/Android share targets
- PWA manifest / service worker
- Production deploy (Vercel + hosted Supabase)
- Settings UI (EPIC-008)

## Architecture Decisions

- Monorepo (pnpm workspaces) with `apps/*` (web, extension, ios, android) and `packages/*` (shared-types, api-client), so the future Chrome extension and native apps can share a contract without restructuring later.
- Frontend: Next.js (TypeScript, App Router) as a PWA. Backend: Next.js Route Handlers under `apps/web/app/api/v1/*` for Phase 1 (not separate Supabase Edge Functions) — single deployable, fastest iteration.
- Data/auth/storage: Supabase (Postgres, Auth, Storage). Edge Functions introduced starting Phase 2 for the event-driven AI metadata worker.
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
- cheerio (URL title fetch on capture)
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
    └── migrations/20260705001030_init.sql
```

## Data Model

Implemented in [supabase/migrations/20260705001030_init.sql](supabase/migrations/20260705001030_init.sql):

- `public.profiles`: id (FK auth.users), email, display_name, avatar_url, created_at, updated_at. Auto-created on signup via trigger.
- `public.knowledge_assets`: id, user_id, type (url/text/pdf/image), source (web_pwa/chrome_extension/ios_share/android_share/api), status (pending/processing/ready/failed), title, raw_content, url, storage_path, mime_type, content_hash, summary, tags (text[]), metadata (jsonb), search_vector (generated tsvector), created_at, updated_at, deleted_at. RLS: `auth.uid() = user_id`.
- `search_knowledge_assets(query, result_limit)` RPC for user-scoped FTS.
- Storage bucket `knowledge-assets`, path `{user_id}/…`, private + RLS on `storage.objects`.
- Phase 2: `vector(1536) embedding` column (not yet added).

## Epic Status Table

| Epic | Phase | Status | Notes | Last Updated |
|---|---|---|---|---|
| EPIC-001 Universal Inbox | 1 | **Done** | Chronological list + load more via `@saave/api-client` | 2026-07-05 |
| EPIC-002 Universal Capture | 1 | **Done** | URL/text/pdf/image capture; dedup by content hash; PDF/image verified end-to-end via curl | 2026-07-05 |
| EPIC-006 Search | 1 | **Done** | Debounced FTS search bar on inbox; verified match + empty-state via curl | 2026-07-05 |
| EPIC-007 Authentication | 1 | **Done** | Magic link + OAuth + sign-out verified E2E locally. In prod: magic link uses default-template PKCE flow (Google OAuth disabled, no creds yet) | 2026-07-05 |
| EPIC-009 AI Metadata Extraction | 2 | Not Started | | 2026-07-05 |
| EPIC-005 Chrome Extension | 3 | Not Started | | 2026-07-05 |
| EPIC-003 iOS Share Extension | 4 | Not Started | Apple Sign-In bundled here | 2026-07-05 |
| EPIC-004 Android Share Target | 4 | Not Started | | 2026-07-05 |
| EPIC-008 Settings | TBD | Not Started | Candidate home for future tag-management UI | 2026-07-05 |

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

## Open Questions

- Google OAuth: no local *or* production credentials yet. Local needs them in `supabase/.env`; production needs a real client_id/secret from Google Cloud Console plus flipping `external.google.enabled` back on for the hosted project (currently forced off).
- Production magic-link PKCE-across-browser-contexts risk (see Decision Log above) is unverified in practice — untested whether real users hitting this in practice is common enough to matter. Revisit if users report failed sign-ins, or when SMTP/paid-tier is set up to restore the token_hash flow.
- `auth.rate_limit.email_sent = 2`/hour and `max_frequency = "1s"` (very permissive resend interval) now apply to a public production auth endpoint — inherited from local-dev-friendly defaults, not deliberately chosen for prod. Worth hardening before real traffic.
- Long-lived-session refresh behavior (the `proxy.ts` cookie-refresh fix) hasn't been observed over a real ~1hr+ session yet — verified via route-shape testing (no loops, correct 401/307s), not via an actual expired-token replay.

## Next Steps

1. Manually test the real magic-link email flow against production (sign in with a real inbox at https://saave-kappa.vercel.app/login) — everything else has been verified via curl, but this is the one path needing an actual email client.
2. Decide on Google OAuth for prod (get real credentials, flip `external.google.enabled` back on for the hosted project) and/or custom SMTP to restore the token_hash magic-link flow in production.
3. Harden production auth rate limits before real traffic (see Open Questions).
4. Phase 2: AI metadata extraction worker (Edge Function, summaries/tags, embeddings).
5. PWA polish: web manifest, service worker, mobile-first layout pass.
6. Phase 3: Chrome extension consuming `/api/v1/*`.