import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes Supabase session cookies on every request. Deliberately has NO
 * redirect logic — a prior version redirected unauthenticated /inbox and
 * /api/v1/* requests here and that caused self-redirect loops on Next.js
 * 16.2.10 (see MEMORY.md Decision Log). Auth gating still lives entirely in
 * getSessionUser() per page/route handler; this file only keeps cookies
 * fresh so Server Component renders (which can't write cookies themselves)
 * don't silently drop a rotated refresh token.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Triggers a token refresh (and cookie rewrite via setAll above) when the
  // access token is expired. Result intentionally unused — no redirects here.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
