# CLAUDE.md

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

## Claude Code Specific Notes

- Before considering a coding task done, use the `verify` skill to confirm the change actually works end-to-end, not just that it typechecks.
- Use the `code-review` skill on nontrivial diffs before committing.
- Full working conventions (TypeScript strictness, RLS, API versioning) live in `AGENTS.md` — read it too.
- `apps/web` uses Next.js 16.2.10 — very new, likely newer than training data. Read `apps/web/node_modules/next/dist/docs/` before writing Next.js code, and heed deprecation notices.
