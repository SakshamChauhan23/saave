"use client";

import { ApiError } from "@saave/api-client";
import type { KnowledgeAsset } from "@saave/shared-types";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { getApiClient } from "@/lib/api/client";
import { AssetCard } from "./asset-card";

type InboxAppProps = {
  userEmail: string;
};

type CaptureMode = "url" | "text" | "file";

export function InboxApp({ userEmail }: InboxAppProps) {
  const api = getApiClient();

  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [captureMode, setCaptureMode] = useState<CaptureMode>("url");
  const [urlInput, setUrlInput] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  const loadInbox = useCallback(
    async (cursor?: string) => {
      const result = await api.listKnowledgeAssets(cursor);
      return result;
    },
    [api],
  );

  const applyInboxResult = useCallback(
    (result: { assets: KnowledgeAsset[]; next_cursor: string | null }) => {
      setAssets(result.assets);
      setNextCursor(result.next_cursor);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setIsSearching(false);
      setActiveSearch("");
    });

    loadInbox()
      .then((result) => {
        if (cancelled) return;
        applyInboxResult(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load inbox");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadInbox, applyInboxResult]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    let cancelled = false;
    const handle = setTimeout(() => {
      queueMicrotask(() => {
        if (cancelled) return;
        setIsSearching(true);
        setLoading(true);
        setError(null);
      });

      api
        .searchKnowledgeAssets(trimmed)
        .then((result) => {
          if (cancelled) return;
          setActiveSearch(trimmed);
          applyInboxResult(result);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : "Search failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, api, applyInboxResult]);

  useEffect(() => {
    if (searchQuery.trim() || !activeSearch) return;

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setIsSearching(false);
      setActiveSearch("");
    });

    loadInbox()
      .then((result) => {
        if (cancelled) return;
        applyInboxResult(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load inbox");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeSearch, loadInbox, applyInboxResult]);

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = isSearching
        ? await api.searchKnowledgeAssets(activeSearch, nextCursor)
        : await loadInbox(nextCursor);
      setAssets((prev) => [...prev, ...result.assets]);
      setNextCursor(result.next_cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCapture(e: FormEvent) {
    e.preventDefault();
    setCapturing(true);
    setCaptureMessage(null);
    setError(null);

    try {
      let created: KnowledgeAsset;

      if (captureMode === "url") {
        const res = await api.createKnowledgeAsset({
          type: "url",
          url: urlInput.trim(),
          source: "web_pwa",
        });
        created = res.asset;
        setUrlInput("");
      } else if (captureMode === "text") {
        const res = await api.createKnowledgeAsset({
          type: "text",
          content: textContent.trim(),
          source: "web_pwa",
          ...(textTitle.trim() ? { title: textTitle.trim() } : {}),
        });
        created = res.asset;
        setTextContent("");
        setTextTitle("");
      } else {
        const input = document.getElementById("file-input") as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (!file) {
          setCaptureMessage("Choose a file to upload.");
          return;
        }
        const type = file.type === "application/pdf" ? "pdf" : "image";
        if (type === "image" && !file.type.startsWith("image/")) {
          setCaptureMessage("Only PDF and image files are supported.");
          return;
        }
        const res = await api.captureFile(file, { type, source: "web_pwa" }, file.name);
        created = res.asset;
        if (input) input.value = "";
      }

      if (!isSearching) {
        setAssets((prev) => [created, ...prev]);
      }
      setCaptureMessage("Saved to your inbox.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCaptureMessage("Already in your inbox.");
      } else {
        setCaptureMessage(err instanceof ApiError ? err.message : "Capture failed");
      }
    } finally {
      setCapturing(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Signed in as <strong>{userEmail}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
          >
            Settings
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="cursor-pointer rounded border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your saves…"
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Quick capture</h2>

        <div className="mb-3 flex gap-2">
          {(["url", "text", "file"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCaptureMode(mode)}
              className={`cursor-pointer rounded px-3 py-1 text-sm ${
                captureMode === mode
                  ? "bg-black text-white"
                  : "border border-neutral-300 text-neutral-700"
              }`}
            >
              {mode === "url" ? "URL" : mode === "text" ? "Text" : "File"}
            </button>
          ))}
        </div>

        <form onSubmit={handleCapture} className="flex flex-col gap-3">
          {captureMode === "url" && (
            <input
              type="url"
              required
              placeholder="https://…"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2"
            />
          )}

          {captureMode === "text" && (
            <>
              <input
                type="text"
                placeholder="Title (optional)"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2"
              />
              <textarea
                required
                placeholder="Paste text, notes, or snippets…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={4}
                className="rounded border border-neutral-300 px-3 py-2"
              />
            </>
          )}

          {captureMode === "file" && (
            <input
              id="file-input"
              type="file"
              accept="application/pdf,image/*"
              className="text-sm text-neutral-600"
            />
          )}

          <button
            type="submit"
            disabled={capturing}
            className="cursor-pointer rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            {capturing ? "Saving…" : "Save to inbox"}
          </button>

          {captureMessage && (
            <p
              className={`text-sm ${
                captureMessage.includes("Saved") ? "text-green-700" : "text-neutral-600"
              }`}
            >
              {captureMessage}
            </p>
          )}
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">
            {isSearching ? `Results for “${activeSearch}”` : "All saves"}
          </h2>
          {!loading && <span className="text-xs text-neutral-400">{assets.length} shown</span>}
        </div>

        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && assets.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            {isSearching ? "No matches found." : "Nothing saved yet. Capture something above."}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>

        {nextCursor && (
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="cursor-pointer rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </main>
  );
}