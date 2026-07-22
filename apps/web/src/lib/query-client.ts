import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // React Query's default 'online' mode pauses fetches while the browser
      // reports offline — which would stop the service worker's runtime cache
      // (see vite.config.ts) from ever getting a chance to answer. 'always'
      // lets the fetch happen so the SW can intercept it.
      networkMode: "always",
    },
    mutations: {
      // Same reasoning, but for POS checkout: createSale() does its own
      // navigator.onLine check and offline queueing (see features/pos/api.ts)
      // — React Query pausing the mutation before that code ever runs would
      // leave "Processing..." stuck forever instead of queueing the sale.
      networkMode: "always",
    },
  },
});
