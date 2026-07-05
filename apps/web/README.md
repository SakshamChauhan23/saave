# Saave Web App

Next.js PWA for the Saave universal knowledge inbox.

## Local development

Prerequisites: Node.js, pnpm, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

1. Start Supabase from the repo root (applies migrations):

```bash
supabase start
```

2. Copy env files and fill in values from the `supabase start` output:

```bash
cp apps/web/.env.example apps/web/.env.local
# Optional — only needed for Google sign-in locally:
cp supabase/.env.example supabase/.env
```

Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local` to the **anon** key printed by `supabase start`.

3. Run the web app from the repo root:

```bash
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (the dev server binds to `127.0.0.1`).

**“Redirected you too many times” (ERR_TOO_MANY_REDIRECTS):** open [http://127.0.0.1:3000/auth/clear](http://127.0.0.1:3000/auth/clear) first (wipes stale auth cookies), then go to `/login`.

### Magic link (local)

Magic-link emails are captured by Inbucket at [http://127.0.0.1:54324](http://127.0.0.1:54324) — no SMTP setup required.

### Google OAuth (optional locally)

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add authorized redirect URI: `http://127.0.0.1:54321/auth/v1/callback`
3. Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `supabase/.env`.
4. Restart Supabase: `supabase stop && supabase start`

For hosted Supabase, enable the Google provider in the dashboard and add the same redirect URLs under Authentication → URL Configuration.