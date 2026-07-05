"use client";

import { useState, type FormEvent } from "react";
import { getAuthCallbackUrl } from "@/lib/auth/site-url";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  callbackError?: boolean;
  callbackErrorMessage?: string | null;
};

export function LoginForm({
  callbackError,
  callbackErrorMessage,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setErrorMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthCallbackUrl() },
    });
    if (error) {
      setErrorMessage(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Saave</h1>

      <p className="text-xs text-neutral-500">
        Stuck in a redirect loop?{" "}
        <a href="/auth/clear" className="underline">
          Clear session
        </a>
      </p>

      {callbackError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-medium">Sign-in could not be completed.</p>
          <p className="mt-1">
            {callbackErrorMessage ??
              "Request a new magic link and open it in this same browser."}
          </p>
        </div>
      )}

      {status === "sent" ? (
        <p className="text-sm text-neutral-600">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={status === "sending" || !email}
            className="cursor-pointer rounded bg-black px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {status === "error" && errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </form>
      )}

      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <div className="h-px flex-1 bg-neutral-200" />
        or
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading}
        className="cursor-pointer rounded border border-neutral-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      {errorMessage && status !== "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </main>
  );
}