"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Fallback for implicit-flow redirects that arrive with tokens in the URL hash. */
export default function AuthCompletePage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in…");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
      router.replace("/login?error=auth_callback_failed&message=No+session+tokens+found");
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=auth_callback_failed&message=Invalid+session+tokens");
      return;
    }

    const supabase = createClient();
    void supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setMessage(error.message);
          router.replace(
            `/login?error=auth_callback_failed&message=${encodeURIComponent(error.message)}`,
          );
          return;
        }
        window.history.replaceState(null, "", "/auth/complete");
        router.replace("/inbox");
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <p className="text-sm text-neutral-600">{message}</p>
    </main>
  );
}