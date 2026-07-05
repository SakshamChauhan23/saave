import { createApiClient } from "@saave/api-client";

let client: ReturnType<typeof createApiClient> | null = null;

export function getApiClient() {
  if (!client) {
    client = createApiClient({ baseUrl: "" });
  }
  return client;
}