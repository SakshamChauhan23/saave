"use client";

import { ApiError } from "@saave/api-client";
import type { AiProvider, AiProviderKeyStatus } from "@saave/shared-types";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getApiClient } from "@/lib/api/client";

type SettingsAppProps = {
  userEmail: string;
};

export function SettingsApp({ userEmail }: SettingsAppProps) {
  const api = getApiClient();

  const [status, setStatus] = useState<AiProviderKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAiKeyStatus()
      .then(setStatus)
      .catch(() => setMessage("Failed to load AI settings."))
      .finally(() => setLoading(false));
  }, [api]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.setAiKey(provider, apiKey.trim());
      setStatus(result);
      setApiKey("");
      setMessage("Key saved.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to save key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);
    try {
      const result = await api.deleteAiKey();
      setStatus(result);
      setMessage("Key removed.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to remove key.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Signed in as <strong>{userEmail}</strong>
          </p>
        </div>
        <Link
          href="/inbox"
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Back to inbox
        </Link>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-700">AI metadata extraction</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Bring your own API key to have Saave generate titles, summaries, and tags for your
          captures. Without a key, capture and search still work fine — you just won&apos;t get
          AI enrichment. Your key is encrypted at rest and never shown again after saving.
        </p>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : status?.configured ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-neutral-700">
              Configured: <strong>{status.provider === "anthropic" ? "Anthropic" : "OpenAI"}</strong>
              {status.provider === "anthropic" && (
                <span className="text-neutral-500"> (titles/summaries/tags only — no search embeddings)</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              className="w-fit cursor-pointer rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove key"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="flex gap-2">
              {(["anthropic", "openai"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`cursor-pointer rounded px-3 py-1 text-sm ${
                    provider === p
                      ? "bg-black text-white"
                      : "border border-neutral-300 text-neutral-700"
                  }`}
                >
                  {p === "anthropic" ? "Anthropic" : "OpenAI"}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              {provider === "anthropic"
                ? "Anthropic generates titles, summaries, and tags. It has no embeddings API, so search stays full-text only."
                : "OpenAI generates titles, summaries, and tags, plus embeddings for semantic search."}
            </p>
            <input
              type="password"
              required
              placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2"
            />
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="w-fit cursor-pointer rounded bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save key"}
            </button>
          </form>
        )}

        {message && <p className="mt-3 text-sm text-neutral-600">{message}</p>}
      </section>
    </main>
  );
}
