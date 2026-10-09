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
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        name: "POS",
        short_name: "POS",
        description: "Point of sale, inventory, and back-office management.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Product/category catalog reads — cached so the POS terminal can
            // keep browsing and charging sales through a connectivity drop.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/products") || url.pathname.startsWith("/api/categories"),
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
