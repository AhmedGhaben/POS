import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// `vite build --mode desktop` builds the copy bundled into the Windows app
// (apps/desktop). No service worker there: it's served from a custom app://
// scheme and keeps its offline data in IndexedDB instead.
export default defineConfig(({ mode }) => ({
  build: mode === "desktop" ? { outDir: "dist-desktop" } : undefined,
  plugins: [
    react(),
    VitePWA({
      disable: mode === "desktop",
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["brand/storbit-logo-original.png", "brand/storbit-logo-light.png", "favicon.ico", "apple-touch-icon.png", "pwa-icon.svg"],
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        name: "STORBIT",
        short_name: "STORBIT",
        description: "STORBIT: point of sale, inventory, and back-office management.",
        theme_color: "#0F1221",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [
          { src: "/brand/storbit-app-icon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        // The app's main bundle (just over 2 MiB, workbox's default limit)
        // must be precached, or the web POS can't start offline.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Product/category catalog reads — cached so the POS terminal can
            // keep browsing and charging sales through a connectivity drop.
            // Archive/delete stock checks must reach the server; never use catalog cache.
            urlPattern: ({ url }) =>
              (url.pathname.startsWith("/api/products") && !url.pathname.endsWith("/stock")) || url.pathname.startsWith("/api/categories"),
            handler: "NetworkFirst",
            options: {
              cacheName: "pos-catalog-cache",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
}));
