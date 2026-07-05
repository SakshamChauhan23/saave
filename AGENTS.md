# AGENTS.md — Instructions for AI Coding Agents

This file applies to any AI coding tool working in this repository (Claude Code, Grok, Cursor, or others).

## Next.js Version Warning

`apps/web` uses Next.js 16.2.10 — very new, likely newer than your training data. APIs, conventions, and file structure may differ from what you expect. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices.

## Mandatory Session Protocol

1. **Before doing any work in this repo, read `MEMORY.md` in full.** It is the source of truth for architecture, tech stack, epic status, and open questions — do not assume prior conversation context carries over.
2. **After completing any development, edit, or even a small change** (new file, schema tweak, config change, bug fix), update `MEMORY.md` before ending the session/turn:
   - If you made an architectural or technical decision (chose a library, changed a data model, picked an approach among alternatives), **append** a new dated entry to the Decision Log. Never edit or delete past entries.
   - If your change affects an Epic's status, update its row in the Epic Status Table (and the corresponding `docs/epics/EPIC-XXX.md` if relevant).
   - If your change alters folder layout, tech stack, or the data model, overwrite the Repo Structure, Tech Stack, or Data Model section so it matches reality.
   - Overwrite Next Steps with the next 3-5 concrete actions.
   - If you found a new unresolved question/blocker, add it to Open Questions; if you resolved one, remove it (and log the resolution in the Decision Log if significant).
3. **Never skip step 2, even for small changes** — a missed update breaks continuity for the next agent or session, on any tool.
4. If `MEMORY.md` doesn't exist yet or looks stale/inconsistent with the code, reconcile it before proceeding, and note the reconciliation in the Decision Log.

## Working Conventions

- TypeScript strict mode; Zod validation at every API boundary (`packages/shared-types` is the single source of truth for those schemas).
- Supabase RLS is the only authorization mechanism for user data — never use the service-role key in a user-facing request path.
- API routes under `apps/web/app/api/v1/*` are a versioned public contract also consumed by the future Chrome extension and native apps — avoid breaking changes without bumping the version.
- No normalized tags table — tags are AI-suggested/free-form per the "zero organization" product principle. Don't add one without updating MEMORY.md's Architecture Decisions and noting why.

## Repo Layout

See `MEMORY.md` > Repo Structure for the current map.
