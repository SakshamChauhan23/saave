# MEMORY.md

This is the living project journal for Saave. Any AI coding tool working in this repo must read this file before starting work and update it after any change. See `AGENTS.md` for the exact protocol.

## Overview

Saave is a universal knowledge inbox: capture content from any platform (Instagram, LinkedIn, X, ChatGPT, Claude, Gmail, newsletters, PDFs, browser) into one place, then turn it into a personalized learning experience. Principles: capture first, mobile first, one inbox, zero organization, AI assists never interrupts. See `docs/00-Product-Vision.md` and `docs/01-PRD.md`.

## Architecture Decisions

- Monorepo (pnpm workspaces) with `apps/*` (web, extension, ios, android) and `packages/*` (shared-types, api-client), so the future Chrome extension and native apps can share a contract without restructuring later.
- Frontend: Next.js (TypeScript, App Router) as a PWA. Backend: Next.js Route Handlers under `apps/web/app/api/v1/*` for Phase 1 (not separate Supabase Edge Functions) — single deployable, fastest iteration.
- Data/auth/storage: Supabase (Postgres, Auth, Storage). Edge Functions introduced starting Phase 2 for the event-driven AI metadata worker.
- Auth Phase 1 scope: email magic-link + Google OAuth only. Sign in with Apple deferred to Phase 4 (bundled with the paid Apple Developer account setup the iOS Share Extension already requires).
- Search Phase 1: Postgres full-text search (tsvector/GIN). Semantic/embedding search added in Phase 2 once AI metadata extraction exists to generate embeddings from.
- No normalized tags table — tags are AI-suggested/free-form (`text[]` column), consistent with the "zero organization" principle.
- API versioned from the first route (`/api/v1/*`) since Phase 3 (Chrome extension) and Phase 4 (iOS/Android) will consume it directly.

## Tech Stack

- Next.js (TypeScript, App Router, Tailwind, ESLint) — `apps/web`
- Supabase: Postgres, Auth, Storage, Edge Functions (Phase 2+)
- pnpm workspaces (monorepo package manager)
- Zod (API/schema validation), `@supabase/ssr` (auth/session helpers)
- Hosting: Vercel (web app), Supabase (backend)

## Repo Structure

```
Saave/
├── MEMORY.md / AGENTS.md / CLAUDE.md
├── README.md
├── docs/                  # product vision, PRD, epics
├── apps/
│   ├── web/               # Next.js PWA (Phase 1)
│   ├── extension/         # Chrome extension (Phase 3, not yet created)
│   ├── ios/                # iOS Share Extension (Phase 4, not yet created)
│   └── android/            # Android Share Target (Phase 4, not yet created)
├── packages/
│   ├── shared-types/       # Zod schemas + TS types (not yet created)
│   └── api-client/          # fetch wrappers over /api/v1/* (not yet created)
└── supabase/               # config.toml, migrations/, functions/ (not yet created)
```

## Data Model

Not yet created. Planned (see plan for full detail):
- `public.profiles`: id, email, display_name, avatar_url, created_at, updated_at.
- `public.knowledge_assets`: id, user_id, type (url/text/pdf/image), source (web_pwa/chrome_extension/ios_share/android_share/api), status (pending/processing/ready/failed), title, raw_content, url, storage_path, mime_type, content_hash, summary, tags (text[]), metadata (jsonb), embedding (vector(1536), added Phase 2), search_vector (generated tsvector), created_at, updated_at, deleted_at. RLS: `auth.uid() = user_id`.
- Storage bucket `knowledge-assets`, path `{user_id}/{asset_id}/{filename}`, private + signed URLs.

## Epic Status Table

| Epic | Phase | Status | Notes | Last Updated |
|---|---|---|---|---|
| EPIC-001 Universal Inbox | 1 | Not Started | | 2026-07-05 |
| EPIC-002 Universal Capture | 1 | Not Started | | 2026-07-05 |
| EPIC-006 Search | 1 | Not Started | FTS first, embeddings in Phase 2 | 2026-07-05 |
| EPIC-007 Authentication | 1 | Not Started | Email + Google only for Phase 1 | 2026-07-05 |
| EPIC-009 AI Metadata Extraction | 2 | Not Started | | 2026-07-05 |
| EPIC-005 Chrome Extension | 3 | Not Started | | 2026-07-05 |
| EPIC-003 iOS Share Extension | 4 | Not Started | Apple Sign-In bundled here | 2026-07-05 |
| EPIC-004 Android Share Target | 4 | Not Started | | 2026-07-05 |
| EPIC-008 Settings | TBD | Not Started | Candidate home for future tag-management UI | 2026-07-05 |

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

## Open Questions

- None currently blocking. (Apple Developer account question resolved above — revisit before Phase 4.)

## Next Steps

1. `git init` and make the initial commit (memory files + existing docs).
2. Check local toolchain availability (node, pnpm, Supabase CLI, Docker) before scaffolding.
3. Scaffold the monorepo: root `package.json` + `pnpm-workspace.yaml`, `apps/web` via `create-next-app`, `packages/shared-types`, `packages/api-client`.
4. Set up Supabase project (local `supabase init`/migrations first; hosted project creation needs the user's Supabase account).
5. Implement Phase 1 vertical slice: auth → capture → inbox → search, then run the Phase 1 verification checklist end-to-end.
