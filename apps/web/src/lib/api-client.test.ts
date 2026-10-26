import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store";
import { apiClient, ApiError } from "./api-client";

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers each call to a URL from its own queue of responses (or errors). */
function mockFetch(routes: Record<string, (Response | Error)[]>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace("/api", "");
    const next = routes[path]?.shift();
    if (!next) throw new Error(`unexpected call to ${path}`);
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const signedIn = () => useAuthStore.setState({ accessToken: "old-token", user: { id: "u1" } as never, offline: false });

describe("session refresh on a 401", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signedIn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a rate-limited or failed refresh and keeps the session", async () => {
    const fetchMock = mockFetch({
      "/things": [json(401), json(200, { ok: true })],
      "/auth/refresh": [json(429), new TypeError("Failed to fetch"), json(200, { accessToken: "new-token" })],
    });

    const pending = apiClient.get("/things");
    await vi.advanceTimersByTimeAsync(1_000 + 3_000);

    await expect(pending).resolves.toEqual({ ok: true });
    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("keeps the session when the refresh can't be reached at all", async () => {
    mockFetch({
      "/things": [json(401)],
      "/auth/refresh": [json(503), json(503), new TypeError("Failed to fetch"), json(429)],
    });

    const pending = apiClient.get("/things");
    const settled = expect(pending).rejects.toSatisfy((err) => err instanceof ApiError && err.status === 503);
    await vi.advanceTimersByTimeAsync(1_000 + 3_000 + 10_000);
    await settled;

    expect(useAuthStore.getState().user).not.toBeNull();
    expect(useAuthStore.getState().accessToken).toBe("old-token");
  });

  it("signs out only when the server refuses the refresh", async () => {
    mockFetch({ "/things": [json(401)], "/auth/refresh": [json(401)] });

    await expect(apiClient.get("/things")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
