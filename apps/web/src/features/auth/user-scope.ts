import type { QueryClient } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/lib/query-client";
import { useAuthStore } from "./store";

/**
 * Server data fetched for one person must never show up for the next one
 * on the same screen (switching cashiers on a till, signing out and in as
 * someone else). Whenever the signed-in person changes, every cached query
 * is reset: nothing of theirs is shown while the new person's data loads,
 * and the queries on screen fetch again under the new session.
 */
export function startUserScopedCache(client: QueryClient = appQueryClient): () => void {
  return useAuthStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id) void client.resetQueries();
  });
}
