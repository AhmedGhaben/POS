import { useAuthStore } from "@/features/auth/store";

const BASE_URL = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

/** Statuses a gateway/host returns when the API itself is down. */
const SERVER_DOWN_STATUSES = new Set([502, 503, 504]);

/**
 * The request never got a real answer from the API: no network, server
 * down behind a proxy, or timed out. Distinct from the server saying no.
 */
export function isUnreachableError(err: unknown): boolean {
  if (err instanceof ApiError) return SERVER_DOWN_STATUSES.has(err.status);
  // fetch() rejects with TypeError on network failure, and with an
  // AbortError/TimeoutError DOMException when our timeout fires.
  return err instanceof TypeError || (err instanceof DOMException && /Abort|Timeout/.test(err.name));
}

/** Worth trying again later (unlike a 4xx rejection, which won't change). */
export function isRetryableError(err: unknown): boolean {
  if (isUnreachableError(err)) return true;
  return err instanceof ApiError && (err.status >= 500 || err.status === 408 || err.status === 429);
}

type ServerStatusListener = (reachable: boolean) => void;
const serverStatusListeners = new Set<ServerStatusListener>();

/** Hears about every request's outcome: did the API answer at all? */
export function onServerStatus(listener: ServerStatusListener): () => void {
  serverStatusListeners.add(listener);
  return () => serverStatusListeners.delete(listener);
}

function reportServerStatus(reachable: boolean) {
  for (const listener of serverStatusListeners) listener(reachable);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return data.accessToken as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  skipAuth?: boolean;
  /** Give up after this long (rejects like a network failure). */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = "GET", body, skipAuth = false, timeoutMs } = options;
  const token = useAuthStore.getState().accessToken;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (err) {
    reportServerStatus(false);
    throw err;
  }
  reportServerStatus(!SERVER_DOWN_STATUSES.has(res.status));

  if (res.status === 401 && !skipAuth && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken);
      return request<T>(path, options, true);
    }
    useAuthStore.getState().clearSession();
  }

  if (!res.ok) {
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      // no JSON body
    }
    const message =
      (errorBody as { message?: string })?.message ?? `Request failed with ${res.status}`;
    throw new ApiError(res.status, message, errorBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, opts?: Pick<RequestOptions, "timeoutMs">) =>
    request<T>(path, { method: "GET", ...opts }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { method: "POST", body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError };
