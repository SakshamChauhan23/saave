import { NextResponse, type NextRequest } from "next/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) PKCE code exchange — reads verifier from request cookies. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inbox";

  const siteUrl = getSiteUrl();

  if (!code) {
    const loginUrl = new URL("/login", siteUrl);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    loginUrl.searchParams.set(
      "message",
      "No authorization code received. Try signing in again.",
    );
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL("/login", siteUrl);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    loginUrl.searchParams.set("message", error.message);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, siteUrl));
}