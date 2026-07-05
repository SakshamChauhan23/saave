import type {
  AiProvider,
  AiProviderKeyStatus,
  CaptureFileFields,
  CaptureRequest,
  CaptureResponse,
  KnowledgeAsset,
  SearchResult,
} from "@saave/shared-types";

/**
 * Thin fetch wrapper over /api/v1/*, shared by apps/web today and by
 * apps/extension (Phase 3). Native apps (Phase 4) call the same endpoints
 * directly over HTTP and don't consume this package.
 */

export interface ApiClientOptions {
  /** Origin the API is served from, e.g. "https://saave.app" or "http://localhost:3000". */
  baseUrl: string;
  /** Returns a bearer token for cross-origin callers (e.g. the Chrome extension). Omit for same-origin cookie auth. */
  getAuthToken?: () => Promise<string | null>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

export function createApiClient({ baseUrl, getAuthToken }: ApiClientOptions) {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = await getAuthToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: getAuthToken ? "omit" : "include",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(
        (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
        res.status,
        body,
      );
    }
    return res;
  }

  return {
    async createKnowledgeAsset(payload: CaptureRequest): Promise<CaptureResponse> {
      const res = await request("/api/v1/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },

    async captureFile(
      file: Blob,
      fields: CaptureFileFields,
      filename?: string,
    ): Promise<CaptureResponse> {
      const form = new FormData();
      form.set("file", file, filename);
      form.set("type", fields.type);
      form.set("source", fields.source);
      const res = await request("/api/v1/capture", { method: "POST", body: form });
      return res.json();
    },

    async listKnowledgeAssets(cursor?: string): Promise<{ assets: KnowledgeAsset[]; next_cursor: string | null }> {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await request(`/api/v1/assets${qs}`);
      return res.json();
    },

    async searchKnowledgeAssets(q: string, cursor?: string): Promise<SearchResult> {
      const params = new URLSearchParams({ q, ...(cursor ? { cursor } : {}) });
      const res = await request(`/api/v1/search?${params.toString()}`);
      return res.json();
    },

    async getAiKeyStatus(): Promise<AiProviderKeyStatus> {
      const res = await request("/api/v1/settings/ai-key");
      return res.json();
    },

    async setAiKey(provider: AiProvider, apiKey: string): Promise<AiProviderKeyStatus> {
      const res = await request("/api/v1/settings/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      return res.json();
    },

    async deleteAiKey(): Promise<AiProviderKeyStatus> {
      const res = await request("/api/v1/settings/ai-key", { method: "DELETE" });
      return res.json();
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
