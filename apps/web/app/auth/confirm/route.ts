import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/inbox";

  const siteUrl = getSiteUrl();

  if (!tokenHash || !type) {
    const loginUrl = new URL("/login", siteUrl);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    loginUrl.searchParams.set("message", "Invalid or expired sign-in link.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    const loginUrl = new URL("/login", siteUrl);
    loginUrl.searchParams.set("error", "auth_callback_failed");
    loginUrl.searchParams.set("message", error.message);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, siteUrl));
}