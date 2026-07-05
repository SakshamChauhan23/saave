"use client";

import { useEffect } from "react";

/** Forwards hash-based magic links (implicit flow) to `/callback` before navigation drops them. */
export function AuthHashHandler() {
  useEffect(() => {
    const { pathname, hash } = window.location;
    if (pathname === "/callback" || !hash) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (!params.get("access_token")) return;

    window.location.replace(`/auth/complete${hash}`);
  }, []);

  return null;
}