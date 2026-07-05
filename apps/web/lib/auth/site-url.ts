/** Canonical app origin for auth redirects (must match supabase `site_url` host). */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

export function getAuthCallbackUrl(): string {
  return `${getSiteUrl()}/callback`;
}