import { redirect } from "next/navigation";

type AuthSearchParams = {
  code?: string;
  token_hash?: string;
  type?: string;
};

/** Preserve Supabase auth params by forwarding to `/callback` before session checks. */
export function forwardAuthCodeIfPresent(
  params: AuthSearchParams,
  extra?: Record<string, string | undefined>,
): void {
  const code = params.code;
  if (code) {
    const query = new URLSearchParams({ code });
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) query.set(key, value);
      }
    }
    redirect(`/callback?${query.toString()}`);
  }

  const tokenHash = params.token_hash;
  const type = params.type;
  if (tokenHash && type) {
    const query = new URLSearchParams({ token_hash: tokenHash, type });
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) query.set(key, value);
      }
    }
    // /auth/confirm handles token_hash (magic link); /callback only handles
    // OAuth's `code` param and would reject this with "No authorization code".
    redirect(`/auth/confirm?${query.toString()}`);
  }
}